/**
 * Held-out seeds — the guard that decides whether Phase 7 produced a dispatcher or a memory of some
 * passenger traces.
 *
 * ```ts
 * assertDisjointSeedSets([reference, ...candidates]);   // throws if the guard is not a guard
 * const assessments = assessHoldout(reference, candidate);
 * assessments.filter((a) => a.verdict === 'overfitted');
 * ```
 *
 * ## Why this is the most load-bearing file in the phase
 *
 * CLAUDE.md § Tuning discipline: *"Hold out traffic seeds. Tune on one seed set, validate on a
 * disjoint one, or you overfit the weight vector to specific passenger traces and the gain vanishes
 * on new traffic."* docs/06 § Guardrails adds that the risk *"is rarely mentioned in the elevator
 * literature and is entirely real."*
 *
 * The mechanism is specific to this phase and worth stating rather than gesturing at. Common random
 * numbers are what make a near-neighbour comparison affordable here — 99.69 % variance reduction,
 * 324× in replications (docs/03 § *Measured: the reduction depends entirely on how similar the two
 * arms are*). CRN works by giving **every candidate in the round the same passenger traces**. So the
 * search's entire signal is a function of one fixed set of traces, and the search runs hundreds of
 * candidates against it. That is the textbook setup for selection bias: with enough candidates,
 * *something* fits those traces better than the reference does, and the interval on that something
 * excludes zero honestly, because the interval answers a question about those traces and the report
 * asks a question about elevators.
 *
 * The paired-t interval cannot detect this. It is not a defect in the interval. A disjoint seed set
 * is the only instrument that can.
 *
 * ## Two independent tests, because "did not reproduce" has two causes
 *
 * 1. **Confirmation.** Is the improvement still significant on the holdout set? A paired-t interval
 *    on the holdout replications, against the same reference. Failing this is necessary evidence of
 *    a problem and not sufficient — a small holdout set fails it for a real gain too.
 * 2. **Shrinkage.** Is the holdout gain *measurably smaller* than the tuning gain? This is the test
 *    that separates "overfitted" from "underpowered", and it is only available because the two seed
 *    sets are **disjoint**: the two gain estimates are then independent, so their difference has a
 *    variance of `se_t² + se_h²` and admits a two-sample interval. Nothing pairs across the split —
 *    there is no shared trace to pair on, by construction.
 *
 * A **Welch** interval rather than a pooled one, because the two sets routinely differ in size and
 * in spread (the tuning set is usually larger, and the tuned candidate is usually *less* variable on
 * the traces it was tuned to). Welch's `t` with the Satterthwaite degrees of freedom is the standard
 * answer and does not require the variances to match. The `n <= 25` t/z split
 * `reports/statistics.ts` applies is a rule for a **one-sample stopping rule** and does not transfer:
 * a Welch interval is a `t` interval at every `n`, converging to the normal as the df grow.
 *
 * ## What this file will not do
 *
 * Choose. It flags; it does not drop candidates, and it does not silently prefer the holdout number
 * over the tuning number. Both are printed side by side, which is what
 * docs/05-roadmap.md § Phase 7 acceptance asks for: *"a tuned weight vector beats the hand-authored
 * `predictive-balanced` profile on **held-out seeds** with a paired-t interval excluding zero."*
 */

import { studentTQuantile, DEFAULT_CONFIDENCE } from '../../reports/statistics.js';
import type { MeanEstimate, MetricDirection } from '../../reports/types.js';
import {
  TUNING_OBJECTIVES,
  compareObjective,
  type CompareObjectiveOptions,
  type ObjectiveArm,
} from './pareto.js';
import {
  TuningReportError,
  type CandidateEvaluation,
  type HoldoutAssessment,
  type HoldoutVerdict,
  type ObjectiveComparison,
  type ObjectiveSpec,
  type SeedSetAccounting,
  type SeedSetEvaluation,
  type SeedSetSummary,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Seed-set accounting
 * -------------------------------------------------------------------------- */

/**
 * The distinct seeds of an evaluation, in stored order.
 *
 * @throws TuningReportError on a repeated seed. Two replications on one seed are not independent,
 *   which is the assumption every interval here rests on, and the seed is also the pairing key — a
 *   duplicate breaks both at once. `reports/compare.ts` refuses the same thing for the same reason.
 */
export function seedsOf(evaluation: SeedSetEvaluation): readonly string[] {
  const seen = new Set<string>();
  for (const observation of evaluation.observations) {
    if (seen.has(observation.seed)) {
      throw new TuningReportError(
        `Seed set "${evaluation.seedSetId}" contains seed ${observation.seed} twice (the second is run "${observation.runId}"). Replications must be independent for an interval to mean anything, and the seed is the common-random-numbers pairing key.`,
      );
    }
    seen.add(observation.seed);
  }
  return Object.freeze(evaluation.observations.map((observation) => observation.seed));
}

/** One seed set, accounted for. */
export function summarizeSeedSet(evaluation: SeedSetEvaluation): SeedSetSummary {
  const seeds = seedsOf(evaluation);
  return Object.freeze({
    seedSetId: evaluation.seedSetId,
    role: evaluation.role,
    seeds,
    replications: seeds.length,
  });
}

/** Seeds appearing in both sets, in the first set's order. */
export function sharedSeedsOf(
  tuning: SeedSetEvaluation,
  holdout: SeedSetEvaluation,
): readonly string[] {
  const holdoutSeeds = new Set(holdout.observations.map((observation) => observation.seed));
  return Object.freeze(
    seedsOf(tuning).filter((seed) => holdoutSeeds.has(seed)),
  );
}

/**
 * Refuse a report whose holdout set is not disjoint from its tuning set.
 *
 * @throws TuningReportError naming the shared seeds.
 *
 * This throws rather than warning because an overlapping holdout set does not weaken the guard — it
 * **removes** it, and every downstream `generalizes` verdict then reads as evidence for exactly the
 * thing it failed to test. A report that quietly downgraded itself here would be believed, and the
 * failure would be invisible on the page: the numbers all still compute, and the second set still
 * looks like a second measurement.
 *
 * The one seed that overlaps is the one that matters, so the message names them.
 */
export function assertDisjointSeedSets(candidates: readonly CandidateEvaluation[]): void {
  for (const candidate of candidates) {
    const holdout = candidate.holdout;
    if (holdout === undefined) continue;
    if (holdout.role !== 'holdout' || candidate.tuning.role !== 'tuning') {
      throw new TuningReportError(
        `Candidate "${candidate.candidateId}" declares its sets as ${candidate.tuning.role}/${holdout.role}. The two sets must be declared 'tuning' and 'holdout' respectively; the roles are what every comparison in this module refuses to mix.`,
      );
    }
    const shared = sharedSeedsOf(candidate.tuning, holdout);
    if (shared.length > 0) {
      throw new TuningReportError(
        `Candidate "${candidate.candidateId}" has ${shared.length} seed${shared.length === 1 ? '' : 's'} in both its tuning set ("${candidate.tuning.seedSetId}") and its holdout set ("${holdout.seedSetId}"): ${shared.slice(0, 8).join(', ')}${shared.length > 8 ? ', …' : ''}. A holdout set that overlaps the tuning set is not a weaker guard against overfitting, it is no guard at all — the search already optimized against those traces (CLAUDE.md § Tuning discipline).`,
      );
    }
  }
}

/**
 * Both seed sets, and the disjointness verdict, for the report header.
 *
 * The header's sets are the **first** candidate's — normally the reference arm, and under common
 * random numbers every arm shares them. The disjointness verdict is **not**: it is computed over
 * every candidate and unions their overlaps, because one leaky arm is enough to make the guard
 * meaningless for that arm, and reading the verdict off the reference alone would report a clean
 * split while the arm that overlapped is the one the page is about.
 */
export function accountSeedSets(
  candidates: readonly CandidateEvaluation[],
  options: { readonly requireDisjoint?: boolean | undefined } = {},
): SeedSetAccounting {
  if (candidates.length === 0) {
    throw new TuningReportError('accountSeedSets: at least one candidate is required');
  }
  if (options.requireDisjoint !== false) assertDisjointSeedSets(candidates);

  const shared: string[] = [];
  for (const entry of candidates) {
    const entryHoldout = entry.holdout;
    if (entryHoldout === undefined) continue;
    for (const seed of sharedSeedsOf(entry.tuning, entryHoldout)) {
      if (!shared.includes(seed)) shared.push(seed);
    }
  }

  const first = candidates[0] as CandidateEvaluation;
  const tuning = summarizeSeedSet(first.tuning);
  const holdoutEvaluation = first.holdout;
  if (holdoutEvaluation === undefined) {
    return Object.freeze({
      tuning,
      disjoint: shared.length === 0,
      sharedSeeds: Object.freeze(shared),
    });
  }
  return Object.freeze({
    tuning,
    holdout: summarizeSeedSet(holdoutEvaluation),
    disjoint: shared.length === 0,
    sharedSeeds: Object.freeze(shared),
  });
}

/* -------------------------------------------------------------------------- *
 * The shrinkage interval
 * -------------------------------------------------------------------------- */

/**
 * A Welch two-sample interval on `tuningGain - holdoutGain`.
 *
 * Positive means the gain **shrank** on traffic the search never saw. The two inputs are the paired
 * difference estimates from the two seed sets; they are independent because the sets are disjoint,
 * which is what makes `Var(difference) = se_t² + se_h²` correct with no covariance term to estimate.
 *
 * ```
 * se   = sqrt(se_t² + se_h²)
 * df   = (se_t² + se_h²)² / ( se_t⁴/(n_t−1) + se_h⁴/(n_h−1) )      # Satterthwaite
 * gap  ± t[df, conf] * se
 * ```
 *
 * `NaN` for either half-width — one replication on a side, or a degenerate sample — propagates to a
 * `NaN` interval rather than to a narrow one, and every consumer here reads a non-finite bound as
 * "no evidence" rather than as "no shrinkage".
 *
 * @param direction decides which sign of the raw difference is a *gain*, so that "the gain shrank"
 *   is the positive direction whatever the objective measures.
 */
export function shrinkageInterval(
  tuning: MeanEstimate,
  holdout: MeanEstimate,
  direction: MetricDirection,
  confidence: number = DEFAULT_CONFIDENCE,
): MeanEstimate {
  const sign = direction === 'lower-is-better' ? -1 : 1;
  const tuningGain = sign * tuning.mean;
  const holdoutGain = sign * holdout.mean;
  const gap = tuningGain - holdoutGain;

  const seT = tuning.standardError;
  const seH = holdout.standardError;
  const variance = seT ** 2 + seH ** 2;
  const standardError = Math.sqrt(variance);

  const degreesOfFreedom =
    tuning.n > 1 && holdout.n > 1 && Number.isFinite(variance) && variance > 0
      ? variance ** 2 / (seT ** 4 / (tuning.n - 1) + seH ** 4 / (holdout.n - 1))
      : Number.NaN;

  const quantile = Number.isFinite(degreesOfFreedom)
    ? studentTQuantile(1 - (1 - confidence) / 2, degreesOfFreedom)
    : Number.NaN;
  const halfWidth = quantile * standardError;

  return Object.freeze({
    n: tuning.n + holdout.n,
    mean: gap,
    stdDev: Number.NaN,
    standardError,
    confidence,
    method: 't' as const,
    degreesOfFreedom,
    halfWidth,
    lower: gap - halfWidth,
    upper: gap + halfWidth,
    min: Number.NaN,
    max: Number.NaN,
  });
}

/* -------------------------------------------------------------------------- *
 * The assessment
 * -------------------------------------------------------------------------- */

export interface HoldoutOptions extends CompareObjectiveOptions {
  readonly objectives?: readonly ObjectiveSpec[] | undefined;
}

/**
 * Tuning-set and holdout-set performance of one candidate against the reference, objective by
 * objective, with the overfitting flag.
 *
 * The reference must carry replications on the same seed sets as the candidate — the whole point is
 * that both arms saw the same traces within each set, so the comparison inside each set is paired
 * under common random numbers and only the *split* is unpaired.
 *
 * The verdict table is on {@link HoldoutVerdict}. In one line: a candidate is `overfitted` when its
 * tuning-set gain was significant, its holdout-set gain was not, **and** the drop between them is
 * itself significant. All three clauses matter — the third is what stops a small holdout set from
 * being reported as evidence of overfitting when it is only evidence of a small holdout set.
 */
export function assessHoldout(
  reference: CandidateEvaluation,
  candidate: CandidateEvaluation,
  options: HoldoutOptions = {},
): readonly HoldoutAssessment[] {
  const objectives = options.objectives ?? TUNING_OBJECTIVES;
  const confidence = options.confidence ?? DEFAULT_CONFIDENCE;
  const compareOptions: CompareObjectiveOptions = {
    confidence,
    ...(options.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: options.maxInvalidFraction }),
  };

  const tuningCandidate: ObjectiveArm = {
    candidateId: candidate.candidateId,
    evaluation: candidate.tuning,
  };
  const tuningReference: ObjectiveArm = {
    candidateId: reference.candidateId,
    evaluation: reference.tuning,
  };
  const holdoutPair =
    candidate.holdout !== undefined && reference.holdout !== undefined
      ? ({
          candidate: { candidateId: candidate.candidateId, evaluation: candidate.holdout },
          reference: { candidateId: reference.candidateId, evaluation: reference.holdout },
        } as const)
      : undefined;

  return Object.freeze(
    objectives.map((objective) => {
      const tuning = compareObjective(
        objective,
        tuningCandidate,
        tuningReference,
        compareOptions,
      );
      const holdout =
        holdoutPair === undefined
          ? undefined
          : compareObjective(
              objective,
              holdoutPair.candidate,
              holdoutPair.reference,
              compareOptions,
            );
      return assessOne(objective, candidate.candidateId, reference.candidateId, tuning, holdout, confidence);
    }),
  );
}

/** Gain units: positive is an improvement, whatever the objective's direction is. */
export function gainOf(comparison: ObjectiveComparison | undefined): number {
  if (comparison?.estimate === undefined) return Number.NaN;
  return comparison.direction === 'lower-is-better'
    ? -comparison.estimate.mean
    : comparison.estimate.mean;
}

function assessOne(
  objective: ObjectiveSpec,
  candidateId: string,
  referenceId: string,
  tuning: ObjectiveComparison,
  holdout: ObjectiveComparison | undefined,
  confidence: number,
): HoldoutAssessment {
  const head = {
    candidateId,
    referenceId,
    objectiveId: objective.id,
    label: objective.label,
    unit: objective.unit,
    precision: objective.precision,
    direction: objective.direction,
  } as const;

  const tuningGain = gainOf(tuning);
  const holdoutGain = gainOf(holdout);
  /*
   * A retained *fraction* needs a gain to be a fraction of. Where the tuning set showed no
   * significant improvement the denominator is a number the experiment could not distinguish from
   * zero, and dividing by it produces a percentage that varies wildly with floating-point residue —
   * "retained 50%" from two effects of 1e-16 each. `NaN` there, and the formatter prints nothing.
   */
  const retainedFraction =
    tuning.verdict === 'BETTER' && tuningGain !== 0 ? holdoutGain / tuningGain : Number.NaN;

  const shrinkage =
    tuning.estimate !== undefined && holdout?.estimate !== undefined
      ? shrinkageInterval(tuning.estimate, holdout.estimate, objective.direction, confidence)
      : undefined;

  const confirmedOnHoldout = holdout?.verdict === 'BETTER';
  const gainShrankSignificantly =
    shrinkage !== undefined && Number.isFinite(shrinkage.lower) && shrinkage.lower > 0;

  const { verdict, reason } = verdictOf({
    objective,
    candidateId,
    tuning,
    holdout,
    shrinkage,
    confirmedOnHoldout,
    gainShrankSignificantly,
    retainedFraction,
    confidence,
  });

  return Object.freeze({
    ...head,
    tuning,
    ...(holdout === undefined ? {} : { holdout }),
    tuningGain,
    holdoutGain,
    retainedFraction,
    ...(shrinkage === undefined ? {} : { shrinkage }),
    confirmedOnHoldout,
    gainShrankSignificantly,
    verdict,
    reason,
  });
}

interface VerdictInput {
  readonly objective: ObjectiveSpec;
  readonly candidateId: string;
  readonly tuning: ObjectiveComparison;
  readonly holdout: ObjectiveComparison | undefined;
  readonly shrinkage: MeanEstimate | undefined;
  readonly confirmedOnHoldout: boolean;
  readonly gainShrankSignificantly: boolean;
  readonly retainedFraction: number;
  readonly confidence: number;
}

function verdictOf(input: VerdictInput): { verdict: HoldoutVerdict; reason: string } {
  const level = `${(input.confidence * 100).toFixed(0)}%`;
  const unit = input.objective.unit === '' ? '' : ` ${input.objective.unit}`;
  const round = (value: number): string =>
    Number.isFinite(value) ? value.toFixed(input.objective.precision) : 'n/a';

  if (input.tuning.verdict === 'UNQUOTABLE') {
    return {
      verdict: 'unquotable',
      reason: `no tuning-set interval on ${input.objective.label}: ${input.tuning.reason ?? 'the comparison is not statistically supportable'}`,
    };
  }
  if (input.holdout === undefined) {
    return {
      verdict: 'unquotable',
      reason: `"${input.candidateId}" has no holdout replications, so nothing here validates its tuning-set result. This is the guardrail docs/06 § Guardrails and CLAUDE.md § Tuning discipline both name, and it was not exercised.`,
    };
  }
  if (input.holdout.verdict === 'UNQUOTABLE') {
    return {
      verdict: 'unquotable',
      reason: `no holdout interval on ${input.objective.label}: ${input.holdout.reason ?? 'the comparison is not statistically supportable'}`,
    };
  }
  if (input.tuning.verdict !== 'BETTER') {
    return {
      verdict: 'not-selected',
      reason: `the tuning set showed no improvement on ${input.objective.label} (${input.tuning.verdict}), so there is no claim for the holdout set to validate.`,
    };
  }

  const retained = Number.isFinite(input.retainedFraction)
    ? `${(input.retainedFraction * 100).toFixed(0)}% of the tuning-set gain was retained`
    : 'the retained fraction is undefined, the tuning-set gain being indistinguishable from zero';
  const drop =
    input.shrinkage === undefined || !Number.isFinite(input.shrinkage.halfWidth)
      ? 'the shrinkage interval could not be formed, so the drop between the two sets is unmeasured rather than absent'
      : `the gain fell by ${round(input.shrinkage.mean)}${unit}, ${level} interval [${round(input.shrinkage.lower)}, ${round(input.shrinkage.upper)}]`;

  if (input.confirmedOnHoldout && !input.gainShrankSignificantly) {
    return {
      verdict: 'generalizes',
      reason: `the improvement holds on seeds the search never saw: the holdout paired interval excludes zero at ${level}, and ${drop} — not a measurable drop. ${retained}.`,
    };
  }
  if (input.confirmedOnHoldout) {
    return {
      verdict: 'degraded',
      reason: `the improvement is real on held-out traffic but measurably smaller than on the tuning set: ${drop}. ${retained}. Quote the holdout number, not the tuning one.`,
    };
  }
  if (input.gainShrankSignificantly) {
    return {
      verdict: 'overfitted',
      reason: `OVERFITTED — the tuning-set improvement did not reproduce on disjoint seeds (${input.holdout.verdict} there) and ${drop}, which excludes zero. ${retained}. The weight vector fits the traces it was tuned on, and that is the specific failure held-out seeds exist to catch (CLAUDE.md § Tuning discipline).`,
    };
  }
  return {
    verdict: 'unconfirmed',
    reason: `the tuning-set improvement did not reproduce on disjoint seeds (${input.holdout.verdict} there), but ${drop} — the drop itself is inside the noise floor, so this is as consistent with an underpowered holdout set as with overfitting. Raise the holdout replication count before quoting either number.`,
  };
}
