/**
 * The Pareto front over (AWT, energy proxy, WT95) — and the noise floor that decides what may be
 * excluded from it.
 *
 * ```ts
 * const front = statisticalParetoFront({ candidates, role: 'tuning' });
 * front.front;                  // ids that nothing significantly beats on every axis
 * front.indistinguishablePairs; // pairs the apparatus could not separate at all
 * ```
 *
 * ## Why the front, and not a score
 *
 * docs/06-parameterization-and-tuning.md § Guardrails: *"Do not scalarize too early. Report the
 * Pareto front over (AWT, energy, WT95) rather than collapsing to a single number. Reducing energy
 * generally costs waiting time; that tradeoff is a decision for the building operator, not a
 * constant to bake in."* CLAUDE.md repeats it in § Tuning discipline. A weighted sum of the three
 * would still produce a ranking, and the ranking would be the weights' opinion presented as a
 * measurement — with the weights chosen by whoever wrote the tuner, for a building they have never
 * seen.
 *
 * ## Why dominance is decided by an interval and not by a mean
 *
 * The textbook relation is {@link dominatesPointwise}: `a` dominates `b` when it is no worse on every
 * objective and strictly better on at least one. On a noiseless objective that is the whole story.
 * This objective is not noiseless, and the two facts Phase 3 measured make the naive relation
 * actively harmful here:
 *
 * - **Resolution is ~0.20 s (1.3 % of AWT) at 80 % power for near-neighbour arms at n = 100**
 *   (docs/03 § *Measured: the resolution limit is two numbers, not one*). Phase 7 searches exactly
 *   that regime. A pointwise front over hundreds of near-neighbours would exclude candidates on
 *   differences of 0.02 s — noise, promoted to a structural claim about the search space, and then
 *   never revisited because excluded points are not printed.
 * - **Plateaus produce exact ties.** A step below the decision-flip threshold gives bit-identical
 *   runs — 100/100 exactly-zero paired differences, `rho = 1` (docs/03 § *Measured: flat plateaus,
 *   not noise*). Under pointwise dominance two identical candidates are mutually non-dominated by
 *   the narrowest possible margin, which is right by accident; one floating-point ulp of difference
 *   in one objective flips it to a strict exclusion, which is wrong by the same accident.
 *
 * So {@link statisticalParetoFront} decides dominance from **paired-t intervals on the differences**
 * — the only instrument CLAUDE.md § Statistical discipline permits for a rank order — and it is a
 * rank order, so it needs one:
 *
 * > `a` dominates `b` iff `a` is **significantly better** on at least one objective and
 * > **significantly worse** on none.
 *
 * A pair that differs by less than the noise floor on every axis is therefore mutually
 * non-dominated, stays on the front, and is reported in {@link ParetoFront.indistinguishablePairs}
 * with the floor that swallowed it.
 *
 * ## Common random numbers are assumed, and checked
 *
 * Every comparison here is paired **on the seed**, never on the replication index. In this phase's
 * near-neighbour regime CRN is worth 99.69 % of the variance and 324× in replications
 * (docs/03 § *Measured: the reduction depends entirely on how similar the two arms are*); pairing on
 * index would silently forfeit all of it. {@link ObjectiveComparison.correlation} is reported so a
 * reader can see whether the pairing actually delivered — an `rho` near zero between two
 * near-neighbours means the traces were not shared, whatever the seeds say.
 */

import { pairedDifferenceEstimate, estimateMean, DEFAULT_CONFIDENCE } from '../../reports/statistics.js';
import { intervalExcludesZero } from '../../validation/harness.js';
import { replicationsToResolve } from '../../benchmark/verdict.js';
import type { MeanEstimate, MetricDirection, MetricSpec } from '../../reports/types.js';
import {
  TuningReportError,
  type CandidateEvaluation,
  type DominanceVerdict,
  type IndistinguishablePair,
  type ObjectiveComparison,
  type ObjectivePoint,
  type ObjectiveSpec,
  type ObjectiveVerdict,
  type ObjectiveWinner,
  type ParetoEntry,
  type ParetoFront,
  type SeedSetEvaluation,
  type SeedSetRole,
  type TuningObservation,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The objective table (CLAUDE.md invariant 7)
 * -------------------------------------------------------------------------- */

export const AWT_OBJECTIVE_ID = 'awt';
export const ENERGY_OBJECTIVE_ID = 'energy';
export const WT95_OBJECTIVE_ID = 'wt95';

/**
 * The three axes docs/06 § Guardrails names, as data.
 *
 * ## The energy axis is a seam, and it is now filled
 *
 * `awt` and `wt95` project fields Phase 3 already records. `energy` projects
 * {@link TuningObservation.energyProxy}, and until Phase 8's experiment matrix landed **nothing in
 * the simulator filled it**: `core`'s `RunSummary` carried no energy, no metres travelled and no
 * stop count, and `runner/metrics.ts` projected nineteen scalars, none of them an energy proxy.
 * The consequence was visible rather than papered over — with no proxy supplied the energy
 * objective was **suppressed** on every candidate, `UNQUOTABLE` in every comparison, and the front
 * degenerated to two axes with a report-level note saying so.
 *
 * `core` now records a per-move travel sample and `RunSummary.energy` summarizes it over the
 * reporting window, so `runner/metrics.ts` projects `energyKJ` and a caller has something honest to
 * pass. **The suppression path is not dead and must not be deleted**: a stored record written
 * before the travel record existed carries no `travelSamples`, `summarizeRun` reports
 * `energy.measured: false` with `NaN` rather than `0`, and this table then suppresses the axis
 * exactly as it did before. `pareto.test.ts` exercises that path directly, which is why its
 * fixtures still supply no proxy.
 *
 * What has **not** changed is the refusal to default: the proxy is still not zeroed when absent
 * (which would make every candidate tie on energy and silently restore the two-axis front without
 * saying it did) and still not reconstructed from passenger records (which describe where
 * passengers went, not where the cars went — missing exactly the deadheading that stage 7 spends
 * energy on).
 *
 * The unit is left empty because a proxy's unit is the caller's. A caller measuring car-metres
 * supplies its own table with `unit: 'm'`; that is a table entry, not a code change.
 */
export const TUNING_OBJECTIVES: readonly ObjectiveSpec[] = Object.freeze([
  Object.freeze({
    id: AWT_OBJECTIVE_ID,
    label: 'AWT (mean wait)',
    unit: 's',
    direction: 'lower-is-better' as const,
    precision: 3,
    invalidatedBySaturation: true,
    valueOf: (observation: TuningObservation) => observation.awtS,
    description: 'Average waiting time over the reporting window. The headline objective.',
  }),
  Object.freeze({
    id: ENERGY_OBJECTIVE_ID,
    label: 'Energy (proxy)',
    unit: '',
    direction: 'lower-is-better' as const,
    precision: 3,
    // Energy is spent whether or not the queue diverged; a saturated run's energy is a real
    // measurement of a failing configuration, exactly as its handling capacity is
    // (`MetricSpec.invalidatedBySaturation` makes the same call for throughput).
    invalidatedBySaturation: false,
    valueOf: (observation: TuningObservation) => observation.energyProxy ?? Number.NaN,
    description:
      'Energy consumed over the window, or a proxy for it. Supplied by the caller: `core` records out-of-balance mechanical work per car move and `runner/metrics.ts` projects it as `energyKJ`. Absent on a record written before that existed, and then suppressed rather than defaulted — see the objective table docstring.',
  }),
  Object.freeze({
    id: WT95_OBJECTIVE_ID,
    label: 'WT95 (95th pct wait)',
    unit: 's',
    direction: 'lower-is-better' as const,
    precision: 3,
    invalidatedBySaturation: true,
    valueOf: (observation: TuningObservation) => observation.wt95S,
    description:
      'Ninety-fifth percentile wait. What people experience as "bad"; a mean hides the tail that produces complaints.',
  }),
]);

/**
 * An {@link ObjectiveSpec} as a Phase 3 {@link MetricSpec}.
 *
 * Total and lossless: `ReplicationObservation` is assignable to {@link TuningObservation} (the extra
 * field is optional), so the narrowed `valueOf` is a legitimate widening rather than a cast. This is
 * what lets `buildCandidateReport`, `compareCandidates` and `formatCandidateReport` operate on
 * tuning objectives with no change at all — including their suppression rules, their
 * excluded-replication accounting and their refusal to print a bare mean.
 */
export function objectiveMetricSpec(objective: ObjectiveSpec): MetricSpec {
  return Object.freeze({
    id: objective.id,
    label: objective.label,
    unit: objective.unit,
    direction: objective.direction,
    precision: objective.precision,
    invalidatedBySaturation: objective.invalidatedBySaturation,
    valueOf: objective.valueOf,
  });
}

/** Every objective as a `MetricSpec`, ready for Phase 3's report builders. */
export function objectiveMetricSpecs(
  objectives: readonly ObjectiveSpec[] = TUNING_OBJECTIVES,
): readonly MetricSpec[] {
  return Object.freeze(objectives.map(objectiveMetricSpec));
}

/** @throws TuningReportError on a duplicate objective id, which would make the front ambiguous. */
export function assertDistinctObjectives(objectives: readonly ObjectiveSpec[]): void {
  const seen = new Set<string>();
  for (const objective of objectives) {
    if (seen.has(objective.id)) {
      throw new TuningReportError(
        `Objective "${objective.id}" is declared twice. A front over a repeated axis counts one tradeoff as two, and the second declaration silently wins every lookup.`,
      );
    }
    seen.add(objective.id);
  }
  if (objectives.length === 0) {
    throw new TuningReportError('A Pareto front needs at least one objective; none were supplied.');
  }
}

/* -------------------------------------------------------------------------- *
 * Pointwise dominance — the definition, not the verdict
 * -------------------------------------------------------------------------- */

/**
 * The textbook dominance relation on two scalar vectors.
 *
 * `a` dominates `b` when it is no worse on every objective and strictly better on at least one.
 *
 * **This is the definition, and on this objective it is not the verdict.** It has no notion of a
 * noise floor, so on near-neighbour candidates it excludes points on differences the experiment
 * cannot measure — see the module docstring. It is exported because it is what
 * {@link statisticalParetoFront} reduces to once significance has been established, and because a
 * front over quantities that genuinely have no uncertainty (a cost model, a count of something
 * exact) is a legitimate use.
 *
 * A non-finite value on either side makes the pair **incomparable**, and this function returns
 * `false` in both directions rather than guessing. `NaN` here means "not measured", and a
 * missing measurement is not evidence of anything.
 */
export function dominatesPointwise(
  a: ObjectivePoint,
  b: ObjectivePoint,
  objectives: readonly ObjectiveSpec[] = TUNING_OBJECTIVES,
): boolean {
  let strictlyBetterSomewhere = false;
  for (const objective of objectives) {
    const left = a.values[objective.id];
    const right = b.values[objective.id];
    if (left === undefined || right === undefined) return false;
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    const better = objective.direction === 'lower-is-better' ? left < right : left > right;
    const worse = objective.direction === 'lower-is-better' ? left > right : left < right;
    if (worse) return false;
    if (better) strictlyBetterSomewhere = true;
  }
  return strictlyBetterSomewhere;
}

/** Whether any objective of a point is unmeasured, which makes the point unplaceable. */
function pointIsComplete(
  point: ObjectivePoint,
  objectives: readonly ObjectiveSpec[],
): boolean {
  return objectives.every((objective) => {
    const value = point.values[objective.id];
    return value !== undefined && Number.isFinite(value);
  });
}

/**
 * The non-dominated set over scalar vectors, by {@link dominatesPointwise}.
 *
 * Points with an unmeasured objective are reported as `indeterminate` rather than being dropped or
 * being allowed onto the front: an incomplete point cannot be shown to be dominated, so admitting
 * it would let a candidate reach the front by failing to measure something.
 *
 * {@link ParetoFront.indistinguishablePairs} is always empty here, and that emptiness is the point:
 * pointwise dominance has no noise floor to be inside of, which is exactly why the report does not
 * use it.
 */
export function paretoFrontOfPoints(
  points: readonly ObjectivePoint[],
  objectives: readonly ObjectiveSpec[] = TUNING_OBJECTIVES,
): ParetoFront {
  assertDistinctObjectives(objectives);
  const active = objectives.filter((objective) =>
    points.some((point) => Number.isFinite(point.values[objective.id])),
  );
  const complete = points.map((point) => pointIsComplete(point, active));

  const entries: ParetoEntry[] = points.map((point, index) => {
    if (complete[index] !== true) {
      return Object.freeze({
        candidateId: point.id,
        point,
        onFront: false,
        dominatedBy: Object.freeze([] as string[]),
        indistinguishableFrom: Object.freeze([] as string[]),
        indeterminate: true,
        note: `at least one objective was not measured for "${point.id}", so it cannot be placed on or off the front`,
      });
    }
    const dominatedBy = points
      .filter((other, otherIndex) => otherIndex !== index && complete[otherIndex] === true)
      .filter((other) => dominatesPointwise(other, point, active))
      .map((other) => other.id);
    return Object.freeze({
      candidateId: point.id,
      point,
      onFront: dominatedBy.length === 0,
      dominatedBy: Object.freeze(dominatedBy),
      indistinguishableFrom: Object.freeze([] as string[]),
      indeterminate: false,
    });
  });

  return frontOf(entries, objectives, active, 'pointwise', []);
}

/* -------------------------------------------------------------------------- *
 * Paired objective comparisons
 * -------------------------------------------------------------------------- */

/** One arm of a comparison: who it is, and its replications on one seed set. */
export interface ObjectiveArm {
  readonly candidateId: string;
  readonly evaluation: SeedSetEvaluation;
}

export interface CompareObjectiveOptions {
  /** Two-sided confidence level. Default 0.95 — the level a published interval is quoted at. */
  readonly confidence?: number | undefined;
  /**
   * Fraction of otherwise-usable pairs that may be dropped for statistical invalidity before the
   * comparison is refused outright.
   *
   * **Default 0**, matching `reports/compare.ts`. Dropping the saturated replications is *selection
   * on the outcome variable*: they are systematically the runs with the longest waits, so the
   * survivors' mean is biased in the favourable direction by an unknown amount.
   */
  readonly maxInvalidFraction?: number | undefined;
}

/**
 * The verdict on one objective, read off the interval and the exact-zero count — and nothing else.
 *
 * A restatement of `benchmark/verdict.ts`'s `classify`, generalized over
 * {@link MetricDirection}. `classify` takes a `PairedComparison`, which is keyed by a
 * `ReplicationMetric`; the energy proxy is supplied through {@link TuningObservation.energyProxy}
 * rather than named as one here (see {@link TUNING_OBJECTIVES}), so a
 * `PairedComparison` cannot be constructed for it without stamping a false metric name onto the
 * result. `classify` also hard-codes "negative is better", which is true of every metric Phase 5
 * compares and is not a property this module may assume.
 *
 * The restatement is a real risk — the package barrel says as much: *"A later phase that
 * re-implements those from memory will get them subtly wrong in the optimistic direction."* So it is
 * not left to a comment. `pareto.test.ts` runs both functions over a table of cases and asserts they
 * agree, which turns any future divergence into a failing test rather than a quieter report.
 */
export function objectiveVerdict(input: {
  readonly estimate: MeanEstimate;
  readonly pairs: number;
  readonly exactZeroPairs: number;
  readonly direction: MetricDirection;
  readonly quotable: boolean;
}): ObjectiveVerdict {
  if (!input.quotable) return 'UNQUOTABLE';
  if (input.pairs > 0 && input.exactZeroPairs === input.pairs) return 'IDENTICAL';
  if (!intervalExcludesZero(input.estimate)) return 'INDISTINGUISHABLE';
  const candidateIsLower = input.estimate.upper < 0;
  if (input.direction === 'lower-is-better') return candidateIsLower ? 'BETTER' : 'WORSE';
  return candidateIsLower ? 'WORSE' : 'BETTER';
}

/**
 * Compare one candidate against one reference on one objective, paired on the seed.
 *
 * @throws TuningReportError when the two arms are not the same seed-set role. A tuning-set candidate
 *   measured against a holdout-set reference is not a weaker comparison; it is a different
 *   experiment, and the whole guardrail depends on the two never being mixed.
 */
export function compareObjective(
  objective: ObjectiveSpec,
  candidate: ObjectiveArm,
  reference: ObjectiveArm,
  options: CompareObjectiveOptions = {},
): ObjectiveComparison {
  if (candidate.evaluation.role !== reference.evaluation.role) {
    throw new TuningReportError(
      `compareObjective: "${candidate.candidateId}" is on the ${candidate.evaluation.role} set and "${reference.candidateId}" is on the ${reference.evaluation.role} set. Comparing across the split does not validate anything — it measures two different traffic samples and attributes the difference to the dispatcher.`,
    );
  }

  const confidence = options.confidence ?? DEFAULT_CONFIDENCE;
  const maxInvalidFraction = options.maxInvalidFraction ?? 0;
  const head = {
    objectiveId: objective.id,
    label: objective.label,
    unit: objective.unit,
    direction: objective.direction,
    precision: objective.precision,
    candidateId: candidate.candidateId,
    referenceId: reference.candidateId,
    seedSetId: reference.evaluation.seedSetId,
    role: reference.evaluation.role,
  } as const;

  const candidateBySeed = new Map(
    candidate.evaluation.observations.map((observation) => [observation.seed, observation]),
  );

  const candidateValues: number[] = [];
  const referenceValues: number[] = [];
  let sharedSeeds = 0;
  let droppedInvalid = 0;
  let droppedUnmeasured = 0;

  for (const left of reference.evaluation.observations) {
    const right = candidateBySeed.get(left.seed);
    if (right === undefined) continue;
    sharedSeeds += 1;
    if (objective.invalidatedBySaturation && !(left.awtIsValid && right.awtIsValid)) {
      droppedInvalid += 1;
      continue;
    }
    const a = objective.valueOf(right);
    const b = objective.valueOf(left);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      droppedUnmeasured += 1;
      continue;
    }
    candidateValues.push(a);
    referenceValues.push(b);
  }

  const pairs = candidateValues.length;
  const invalidFraction = sharedSeeds === 0 ? 0 : droppedInvalid / sharedSeeds;

  const unquotableReason =
    sharedSeeds === 0
      ? `"${candidate.candidateId}" and "${reference.candidateId}" share no replication seeds on the ${head.role} set, so no paired comparison is possible. Common random numbers require the same passenger traces on both sides (docs/03-traffic-and-statistics.md § Part 4).`
      : droppedUnmeasured === sharedSeeds
        ? `no replication carried a value for ${objective.label}, so there is nothing to compare. An objective that is not measured is reported as not measured, never as zero.`
        : invalidFraction > maxInvalidFraction
          ? `${droppedInvalid} of ${sharedSeeds} shared replications are statistically invalid, above the ${(maxInvalidFraction * 100).toFixed(0)}% limit. The invalid runs are systematically the worst ones, so comparing the survivors is selection on the outcome variable.`
          : pairs < 2
            ? `only ${pairs} usable pair${pairs === 1 ? '' : 's'} on the ${head.role} set; a paired interval needs at least two, and one run of a lift peak measures one arbitrary scenario.`
            : undefined;

  if (unquotableReason !== undefined) {
    return Object.freeze({
      ...head,
      pairs,
      exactZeroPairs: 0,
      meanDifference: Number.NaN,
      noiseFloor: Number.NaN,
      relativeEffect: Number.NaN,
      correlation: Number.NaN,
      requiredReplications: undefined,
      verdict: 'UNQUOTABLE' as ObjectiveVerdict,
      reason: unquotableReason,
    });
  }

  const estimate = pairedDifferenceEstimate(candidateValues, referenceValues, { confidence });
  const differences = candidateValues.map((value, index) => value - (referenceValues[index] as number));
  const exactZeroPairs = differences.filter((value) => value === 0).length;
  const referenceMean = meanOf(referenceValues);
  const verdict = objectiveVerdict({
    estimate,
    pairs,
    exactZeroPairs,
    direction: objective.direction,
    quotable: true,
  });
  const sd = Number.isFinite(estimate.stdDev) ? estimate.stdDev : Number.NaN;
  const reason = reasonFor(verdict, estimate, objective, exactZeroPairs, pairs, droppedInvalid);

  return Object.freeze({
    ...head,
    pairs,
    exactZeroPairs,
    meanDifference: estimate.mean,
    estimate,
    noiseFloor: estimate.halfWidth,
    relativeEffect: referenceMean === 0 ? Number.NaN : estimate.mean / referenceMean,
    correlation: correlationOf(candidateValues, referenceValues),
    requiredReplications: intervalExcludesZero(estimate)
      ? 1
      : replicationsToResolve(estimate.mean, sd),
    verdict,
    ...(reason === undefined ? {} : { reason }),
  });
}

/** Every objective, for one ordered pair, on one seed set. */
export function compareObjectives(
  candidate: ObjectiveArm,
  reference: ObjectiveArm,
  objectives: readonly ObjectiveSpec[] = TUNING_OBJECTIVES,
  options: CompareObjectiveOptions = {},
): readonly ObjectiveComparison[] {
  assertDistinctObjectives(objectives);
  return Object.freeze(
    objectives.map((objective) => compareObjective(objective, candidate, reference, options)),
  );
}

/* -------------------------------------------------------------------------- *
 * Dominance under a noise floor
 * -------------------------------------------------------------------------- */

/**
 * Reduce a candidate's per-objective comparisons against one rival to a dominance verdict.
 *
 * `a` dominates `b` iff `a` is **significantly** better on at least one objective and significantly
 * worse on none. Everything else — a genuine tradeoff, a pair inside the noise floor, a pair that is
 * bit-identical — is mutually non-dominated, and both stay on the front.
 *
 * One `UNQUOTABLE` objective makes the whole pair `'indeterminate'`. That is stricter than ignoring
 * the axis, and deliberately so: dropping an unmeasurable objective from the relation lets a
 * candidate dominate by having failed to measure the axis it would have lost on.
 *
 * **This is a verdict about a pair, and it is not a verdict about either candidate.** `'indeterminate'`
 * says these two cannot be ranked against each other; it does not say either one is unplaceable.
 * {@link statisticalParetoFront} used to write this pair verdict onto the candidate under
 * consideration, which meant a single arm that omitted one axis made *every* fully-measured arm
 * unplaceable and emptied the front — measured as `front: []` over three candidates, with no error
 * anywhere. Placeability is decided from a candidate's **own** point; see
 * {@link ParetoEntry.indeterminate}.
 *
 * ## Widening an interval is **not** one-way here
 *
 * It is tempting to argue that a wider interval can only ever weaken a claim — an interval that
 * excluded zero may stop excluding it, never the reverse. That is true of a single comparison and
 * **false of this function.** `'dominates'` requires `better > 0 && worse === 0`, so a widening
 * that turns a `WORSE` axis into `INDISTINGUISHABLE` moves a pair from `'mutually-non-dominated'`
 * to `'dominates'` — a strictly *stronger* claim, and one that drops the rival off the front.
 * {@link isIndistinguishable} has the same shape, as does any criterion phrased "must not be
 * significantly worse".
 *
 * So a change to the quantile family, the confidence level or `maxInvalidFraction` has to be
 * checked against the fronts it produces rather than waved through as conservative. Measured for
 * the Student-t change of 2026-07 (review finding #14): no verdict on any published front moves.
 * Every fixture front in this module's suites runs at `n ≤ 24`, where the published interval was
 * already `t`; the one front built from real runs — the holdout round on Garden Apartments — was
 * re-measured at both `n = 24` and `n = 60`, and each of its 12 (candidate, role, objective)
 * verdicts is the same under `z` and under `t`. See T2-BLAST-RADIUS.md § 1.
 */
export function dominanceOf(comparisons: readonly ObjectiveComparison[]): DominanceVerdict {
  if (comparisons.length === 0) return 'indeterminate';
  if (comparisons.some((comparison) => comparison.verdict === 'UNQUOTABLE')) {
    return 'indeterminate';
  }
  const better = comparisons.filter((comparison) => comparison.verdict === 'BETTER').length;
  const worse = comparisons.filter((comparison) => comparison.verdict === 'WORSE').length;
  if (better > 0 && worse === 0) return 'dominates';
  if (worse > 0 && better === 0) return 'dominated-by';
  return 'mutually-non-dominated';
}

/** Whether every objective came back `INDISTINGUISHABLE` or `IDENTICAL`. */
export function isIndistinguishable(comparisons: readonly ObjectiveComparison[]): boolean {
  return (
    comparisons.length > 0 &&
    comparisons.every(
      (comparison) =>
        comparison.verdict === 'INDISTINGUISHABLE' || comparison.verdict === 'IDENTICAL',
    )
  );
}

export interface StatisticalFrontInput {
  /** Every candidate under consideration, in the order the report should print them. */
  readonly candidates: readonly CandidateEvaluation[];
  readonly objectives?: readonly ObjectiveSpec[] | undefined;
  /** Which seed set to build the front over. Default `'tuning'`. */
  readonly role?: SeedSetRole | undefined;
  readonly confidence?: number | undefined;
  readonly maxInvalidFraction?: number | undefined;
}

/**
 * The non-dominated set, with dominance decided by paired-t intervals.
 *
 * O(k²) paired comparisons per objective, computed in both directions rather than mirrored, because
 * a mirrored interval is one sign error away from reversing a verdict and the finalist counts this
 * report sees are small — docs/06 § *Successive halving on replication count* ends its schedule at
 * **three** candidates.
 *
 * ## Who is unplaceable, and why it is decided one candidate at a time
 *
 * A candidate is `indeterminate` — absent from the front, absent from the dominated set, named as
 * unplaceable — when **its own** measurements cannot place it: no replications on this seed set, or
 * no usable value on an axis the front is being decided over. It is then out of the relation
 * entirely: it dominates nothing and nothing dominates it, so the candidates that *did* measure
 * everything still compete against each other on the evidence they have.
 *
 * The alternative — treating one pair's `'indeterminate'` verdict as a fact about the candidate —
 * was measured and is a wrong answer, not a conservative one. Three candidates, two of them
 * complete on `(awt, energy)` and one measuring `awt` alone, produced `front: []`, `dominated: []`
 * and all three `indeterminate`: every fully-measured arm marked unplaceable by the one arm that
 * declined an axis, printed as `0 of 3 non-dominated` with no error anywhere. The guard that
 * matters — *nobody reaches the front by failing to measure the axis they would have lost on* —
 * needs only the incomplete candidate to be excluded, and that is what this does.
 */
export function statisticalParetoFront(input: StatisticalFrontInput): ParetoFront {
  const objectives = input.objectives ?? TUNING_OBJECTIVES;
  assertDistinctObjectives(objectives);
  const role = input.role ?? 'tuning';
  const options: CompareObjectiveOptions = {
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
  };

  const arms = input.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    evaluation: evaluationFor(candidate, role),
  }));

  /*
   * An objective nobody measured carries no information and, being missing uniformly, can favour
   * nobody — so it is dropped from the relation and named in `inactiveObjectiveIds`. An objective
   * measured by *some* candidates stays active, and the candidates that did not measure it become
   * unplaceable below: dropping the axis instead would let a candidate reach the front by not
   * measuring what it would have lost on, and marking everybody unplaceable would empty the front.
   */
  const active = objectives.filter((objective) =>
    arms.some((arm) =>
      (arm.evaluation?.observations ?? []).some((observation) =>
        Number.isFinite(objective.valueOf(observation)),
      ),
    ),
  );

  const points = arms.map((arm) =>
    objectivePointOf(arm.candidateId, arm.evaluation?.observations ?? [], objectives),
  );
  /*
   * Placeability, decided from a candidate's own point and nothing else. An unplaceable candidate is
   * removed from the relation in both directions — it cannot dominate and cannot be dominated — so
   * the arms that measured every active axis still rank against each other.
   */
  const placeable = arms.map(
    (arm, index) =>
      arm.evaluation !== undefined &&
      active.length > 0 &&
      pointIsComplete(points[index] as ObjectivePoint, active),
  );

  const entries: ParetoEntry[] = [];
  const indistinguishablePairs: IndistinguishablePair[] = [];

  for (const [index, arm] of arms.entries()) {
    const evaluation = arm.evaluation;
    const point = points[index] as ObjectivePoint;
    const unplaceable = (note: string): void => {
      entries.push(
        Object.freeze({
          candidateId: arm.candidateId,
          point,
          onFront: false,
          dominatedBy: Object.freeze([] as string[]),
          indistinguishableFrom: Object.freeze([] as string[]),
          indeterminate: true,
          note,
        }),
      );
    };

    if (evaluation === undefined) {
      unplaceable(
        `"${arm.candidateId}" has no replications on the ${role} seed set, so it cannot be placed on or off the front, and it neither dominates nor is dominated by anything`,
      );
      continue;
    }
    // No axis was measured by anybody: there is no relation to evaluate, and nothing may be
    // excluded from a front decided on nothing.
    if (active.length === 0) {
      unplaceable(
        `no objective was measured by any candidate on the ${role} seed set, so there is no relation to place "${arm.candidateId}" in`,
      );
      continue;
    }
    if (placeable[index] !== true) {
      const missing = active
        .filter((objective) => !Number.isFinite(point.values[objective.id]))
        .map((objective) => objective.label);
      unplaceable(
        `"${arm.candidateId}" produced no usable value for ${missing.join(', ')} on the ${role} seed set, so it cannot be placed on or off the front. It takes no part in the dominance relation in either direction — nobody reaches the front by declining to measure the axis they would have lost on, and nobody is excluded by a rival's missing measurement either.`,
      );
      continue;
    }

    const thisArm: ObjectiveArm = { candidateId: arm.candidateId, evaluation };
    const dominatedBy: string[] = [];
    const indistinguishableFrom: string[] = [];
    const notComparableWith: string[] = [];

    for (const [otherIndex, other] of arms.entries()) {
      if (otherIndex === index) continue;
      const otherEvaluation = other.evaluation;
      // An unplaceable rival is out of the relation, in both directions.
      if (otherEvaluation === undefined || placeable[otherIndex] !== true) continue;
      const otherArm: ObjectiveArm = {
        candidateId: other.candidateId,
        evaluation: otherEvaluation,
      };
      const comparisons = compareObjectives(thisArm, otherArm, active, options);
      const verdict = dominanceOf(comparisons);
      if (verdict === 'dominated-by') dominatedBy.push(other.candidateId);
      // Both are placeable and the pair still cannot be ranked: no shared seeds, too few usable
      // pairs, or too many invalid ones. Neither dominates, and the page says so rather than
      // letting "nothing dominated it" stand for "nothing could be compared against it".
      if (verdict === 'indeterminate') notComparableWith.push(other.candidateId);
      if (isIndistinguishable(comparisons)) {
        indistinguishableFrom.push(other.candidateId);
        if (otherIndex > index) {
          indistinguishablePairs.push(
            Object.freeze({
              a: arm.candidateId,
              b: other.candidateId,
              objectives: comparisons,
              identical: comparisons.every((comparison) => comparison.verdict === 'IDENTICAL'),
            }),
          );
        }
      }
    }

    entries.push(
      Object.freeze({
        candidateId: arm.candidateId,
        point,
        onFront: dominatedBy.length === 0,
        dominatedBy: Object.freeze(dominatedBy),
        indistinguishableFrom: Object.freeze(indistinguishableFrom),
        indeterminate: false,
        ...(notComparableWith.length === 0
          ? {}
          : {
              notComparableWith: Object.freeze(notComparableWith),
              note: `no dominance verdict was formed against ${notComparableWith.join(', ')}: the arms are individually placeable but the pairs are not comparable, so "${arm.candidateId}" not being dominated by them is an absence of evidence rather than evidence of absence.`,
            }),
      }),
    );
  }

  return frontOf(entries, objectives, active, 'paired-interval', indistinguishablePairs);
}

/* -------------------------------------------------------------------------- *
 * Winners per objective
 * -------------------------------------------------------------------------- */

export type BestByObjectiveInput = StatisticalFrontInput;

/**
 * The best candidate on each objective — or the leading group, when there is no single best.
 *
 * The leader is the best **point estimate**, which is a statement about an arg-min and not yet a
 * finding. It is promoted to {@link ObjectiveWinner.winnerId} only when the paired interval against
 * **every** other candidate excludes zero on the improving side. Otherwise the leader and everyone
 * it cannot be separated from are reported together and nothing inside that group is ranked.
 *
 * That distinction is the single most likely place this phase produces a worthless winner: the
 * near-neighbour resolution limit is ~0.20 s at n = 100 (docs/03), and a search returning a hundred
 * near-neighbours will routinely have a dozen candidates inside 0.05 s of the leader. Printing the
 * arg-min of those as "the winner" is a coin flip presented as a measurement.
 *
 * ## Only `WORSE` separates, and `BETTER` disqualifies
 *
 * The paired comparison is run as `(candidate = rival, reference = leader)`, so its verdict is about
 * the **rival**: `WORSE` means the rival lost to the leader, and `BETTER` means the rival *beat* the
 * leader. Treating both as "successfully separated" — which this function did until it was measured
 * — declares a winner a rival has beaten. Constructed: a leader on 12 seeds against a rival that is
 * 1.0 s better on every one of those 12 and also carries 12 extra, worse seeds; the rival's own mean
 * is higher, so it loses the arg-min, and the page printed *"leader beats every other candidate on
 * AWT with a paired interval excluding zero"* while the paired interval said the opposite.
 *
 * The point estimates and the paired comparison can only disagree when the arms have different
 * support, because the means are then over different seed sets while the pairing is over their
 * intersection. Where they disagree the paired evidence is the one that decides, and there is no
 * winner: {@link ObjectiveWinner.beatenBy} names who beat the arg-min.
 */
export function bestByObjective(input: BestByObjectiveInput): readonly ObjectiveWinner[] {
  const objectives = input.objectives ?? TUNING_OBJECTIVES;
  assertDistinctObjectives(objectives);
  const role = input.role ?? 'tuning';
  const confidence = input.confidence ?? DEFAULT_CONFIDENCE;
  const options: CompareObjectiveOptions = {
    confidence,
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
  };

  const arms: ObjectiveArm[] = [];
  for (const candidate of input.candidates) {
    const evaluation = evaluationFor(candidate, role);
    if (evaluation === undefined) continue;
    arms.push({ candidateId: candidate.candidateId, evaluation });
  }

  return Object.freeze(
    objectives.map((objective) => {
      const head = {
        objectiveId: objective.id,
        label: objective.label,
        unit: objective.unit,
        precision: objective.precision,
        direction: objective.direction,
      } as const;

      const scored: { readonly arm: ObjectiveArm; readonly estimate: MeanEstimate }[] = [];
      for (const arm of arms) {
        const estimate = ownEstimate(objective, arm.evaluation, confidence);
        if (estimate === undefined) continue;
        scored.push({ arm, estimate });
      }

      if (scored.length === 0) {
        return Object.freeze({
          ...head,
          tiedWith: Object.freeze([] as string[]),
          reason: `no candidate produced a quotable ${objective.label} on the ${role} seed set, so there is no best.`,
        });
      }

      const leader = scored.reduce((best, entry) =>
        objective.direction === 'lower-is-better'
          ? entry.estimate.mean < best.estimate.mean
            ? entry
            : best
          : entry.estimate.mean > best.estimate.mean
            ? entry
            : best,
      );

      const tied: string[] = [];
      const beaten: string[] = [];
      let beatsEveryone = true;
      for (const entry of scored) {
        if (entry.arm.candidateId === leader.arm.candidateId) continue;
        // Read as a statement about `entry`: WORSE is the only verdict in which the leader won.
        const comparison = compareObjective(objective, entry.arm, leader.arm, options);
        if (comparison.verdict === 'WORSE') continue;
        beatsEveryone = false;
        if (comparison.verdict === 'BETTER') beaten.push(entry.arm.candidateId);
        else tied.push(entry.arm.candidateId);
      }

      const inInputOrder = (ids: readonly string[]): readonly string[] =>
        input.candidates.map((candidate) => candidate.candidateId).filter((id) => ids.includes(id));
      const leadingGroup = input.candidates
        .map((candidate) => candidate.candidateId)
        .filter((id) => id === leader.arm.candidateId || tied.includes(id));

      if (beaten.length > 0) {
        const beatenBy = inInputOrder(beaten);
        return Object.freeze({
          ...head,
          estimate: leader.estimate,
          leaderId: leader.arm.candidateId,
          beatenBy: Object.freeze(beatenBy),
          tiedWith: Object.freeze(leadingGroup),
          reason: `no winner on ${objective.label}: "${leader.arm.candidateId}" has the best point estimate, but ${beatenBy.join(', ')} beat${beatenBy.length === 1 ? 's' : ''} it on the seeds they share, with a paired interval excluding zero at ${(confidence * 100).toFixed(0)}%. The two disagree because the arms do not have the same support — the point estimates are means over different seed sets — and the paired interval is the instrument that decides, so nothing here is declared a winner.`,
        });
      }

      if (beatsEveryone && scored.length > 1) {
        return Object.freeze({
          ...head,
          winnerId: leader.arm.candidateId,
          estimate: leader.estimate,
          leaderId: leader.arm.candidateId,
          tiedWith: Object.freeze(leadingGroup),
          reason: `"${leader.arm.candidateId}" beats every other candidate on ${objective.label} with a paired interval excluding zero at ${(confidence * 100).toFixed(0)}%.`,
        });
      }

      return Object.freeze({
        ...head,
        estimate: leader.estimate,
        leaderId: leader.arm.candidateId,
        tiedWith: Object.freeze(leadingGroup),
        reason:
          scored.length === 1
            ? `only one candidate produced a quotable ${objective.label}, so "${leader.arm.candidateId}" leads by default rather than by measurement.`
            : `"${leader.arm.candidateId}" has the best point estimate but cannot be separated from ${leadingGroup.length - 1} other candidate${leadingGroup.length === 2 ? '' : 's'} (${leadingGroup.filter((id) => id !== leader.arm.candidateId).join(', ')}); their differences are inside the noise floor, or could not be quoted at all, so no winner is declared and the group is not ranked.`,
      });
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * Points
 * -------------------------------------------------------------------------- */

/**
 * A candidate's mean on every objective.
 *
 * The projection {@link dominatesPointwise} runs on. A mean is used rather than an interval because
 * a *point* is what a scalar dominance relation consumes; the interval-based relation never touches
 * this, and reads {@link compareObjective} instead.
 *
 * Replications that are statistically invalid are excluded for the objectives that saturation
 * invalidates, matching `reports/compare.ts`. `NaN` where nothing was measurable.
 */
export function objectivePointOf(
  id: string,
  observations: readonly TuningObservation[],
  objectives: readonly ObjectiveSpec[] = TUNING_OBJECTIVES,
): ObjectivePoint {
  const values: Record<string, number> = {};
  for (const objective of objectives) {
    const usable = observations
      .filter((observation) => !objective.invalidatedBySaturation || observation.awtIsValid)
      .map((observation) => objective.valueOf(observation))
      .filter((value) => Number.isFinite(value));
    values[objective.id] = usable.length === 0 ? Number.NaN : meanOf(usable);
  }
  return Object.freeze({ id, values: Object.freeze(values) });
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function frontOf(
  entries: readonly ParetoEntry[],
  objectives: readonly ObjectiveSpec[],
  active: readonly ObjectiveSpec[],
  basis: 'pointwise' | 'paired-interval',
  indistinguishablePairs: readonly IndistinguishablePair[],
): ParetoFront {
  const activeIds = new Set(active.map((objective) => objective.id));
  return Object.freeze({
    objectiveIds: Object.freeze(objectives.map((objective) => objective.id)),
    activeObjectiveIds: Object.freeze(active.map((objective) => objective.id)),
    inactiveObjectiveIds: Object.freeze(
      objectives.filter((objective) => !activeIds.has(objective.id)).map((objective) => objective.id),
    ),
    basis,
    entries: Object.freeze([...entries]),
    front: Object.freeze(entries.filter((entry) => entry.onFront).map((entry) => entry.candidateId)),
    dominated: Object.freeze(
      entries
        .filter((entry) => !entry.onFront && !entry.indeterminate)
        .map((entry) => entry.candidateId),
    ),
    indeterminate: Object.freeze(
      entries.filter((entry) => entry.indeterminate).map((entry) => entry.candidateId),
    ),
    indistinguishablePairs: Object.freeze([...indistinguishablePairs]),
  });
}

function evaluationFor(
  candidate: CandidateEvaluation,
  role: SeedSetRole,
): SeedSetEvaluation | undefined {
  return role === 'tuning' ? candidate.tuning : candidate.holdout;
}

/** One candidate's own interval on one objective, or `undefined` when it may not be quoted. */
function ownEstimate(
  objective: ObjectiveSpec,
  evaluation: SeedSetEvaluation,
  confidence: number,
): MeanEstimate | undefined {
  const usable = evaluation.observations
    .filter((observation) => !objective.invalidatedBySaturation || observation.awtIsValid)
    .map((observation) => objective.valueOf(observation))
    .filter((value) => Number.isFinite(value));
  if (usable.length < 2) return undefined;
  return estimateMean(usable, { confidence });
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function varianceOf(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const mean = meanOf(values);
  let sum = 0;
  for (const value of values) sum += (value - mean) ** 2;
  return sum / (values.length - 1);
}

function correlationOf(a: readonly number[], b: readonly number[]): number {
  if (a.length < 2 || a.length !== b.length) return Number.NaN;
  const meanA = meanOf(a);
  const meanB = meanOf(b);
  let sum = 0;
  for (const [index, value] of a.entries()) sum += (value - meanA) * ((b[index] as number) - meanB);
  const covariance = sum / (a.length - 1);
  return covariance / Math.sqrt(varianceOf(a) * varianceOf(b));
}

function reasonFor(
  verdict: ObjectiveVerdict,
  estimate: MeanEstimate,
  objective: ObjectiveSpec,
  exactZeroPairs: number,
  pairs: number,
  droppedInvalid: number,
): string | undefined {
  const excluded =
    droppedInvalid === 0
      ? ''
      : ` ${droppedInvalid} pair${droppedInvalid === 1 ? '' : 's'} were excluded as statistically invalid, which biases this interval in the favourable direction by an unknown amount.`;

  if (verdict === 'IDENTICAL') {
    return `all ${pairs} paired differences are exactly zero: the two candidates produced bit-identical runs, so the step between them is below the width of a plateau in the objective surface (docs/03-traffic-and-statistics.md § "Measured: flat plateaus, not noise"). No replication budget resolves this — there is nothing there to resolve.${excluded}`;
  }
  if (verdict === 'INDISTINGUISHABLE') {
    const floor = Number.isFinite(estimate.halfWidth)
      ? `±${estimate.halfWidth.toFixed(objective.precision)}${objective.unit === '' ? '' : ` ${objective.unit}`}`
      : 'unmeasurable';
    const sparse =
      exactZeroPairs > 0
        ? ` ${exactZeroPairs} of ${pairs} paired differences are exactly zero, so the effect is carried by the ${pairs - exactZeroPairs} replication${pairs - exactZeroPairs === 1 ? '' : 's'} where a dispatch decision flipped.`
        : '';
    return `the ${(estimate.confidence * 100).toFixed(0)}% paired interval on the difference contains zero; the difference is below this comparison's noise floor of ${floor}, so no rank order is reported.${sparse}${excluded}`;
  }
  if (excluded !== '') return excluded.trim();
  return undefined;
}
