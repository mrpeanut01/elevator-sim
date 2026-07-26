/**
 * The vocabulary of a tuning result — and, more to the point, the vocabulary of what a tuning
 * result is **not allowed to claim**.
 *
 * Phase 7 is the phase most likely to produce a confident lie. Every earlier phase compares a
 * handful of hand-authored arms; this one compares hundreds of near-neighbours, picks the best
 * looking number, and writes it up. Three specific mechanisms turn that into a wrong answer, and
 * the three halves of this module exist one per mechanism:
 *
 * 1. **Scalarizing too early.** Reducing energy generally costs waiting time. Collapsing
 *    `(AWT, energy, WT95)` into one number bakes an operator's tradeoff into a constant and then
 *    reports the constant's opinion as a measurement. docs/06-parameterization-and-tuning.md
 *    § Guardrails: report the **Pareto front**. `pareto.ts`.
 * 2. **Overfitting the weight vector to specific passenger traces.** With CRN the same seeds drive
 *    every candidate in a round, which is exactly what makes the comparison powerful *and* exactly
 *    what lets the winner be tuned to those traces. Tune on one seed set, validate on a **disjoint**
 *    one. `holdout.ts`.
 * 3. **Ranking inside the noise floor.** docs/03-traffic-and-statistics.md § *Measured: the
 *    resolution limit is two numbers, not one* puts near-neighbour resolution at **~0.20 s (1.3 % of
 *    AWT) at 80 % power, n = 100**. A search producing a thousand candidates will produce many that
 *    differ by less than that. They are **indistinguishable**, and saying so is the finding.
 *
 * ## The plateau is part of the vocabulary, not an edge case
 *
 * docs/03 § *Measured: flat plateaus, not noise*: a weight perturbation below the threshold that
 * flips a dispatch decision produces a **bit-identical run** — 100/100 exactly-zero paired
 * differences, `rho = 1`, at `distanceTravelled` steps of 0.01–0.03. So a Phase 7 report will
 * routinely hold candidates that are not merely close to their parent but *identical* to it. That is
 * a different finding from "too noisy to tell": no replication budget resolves it, because there is
 * nothing there to resolve. {@link ObjectiveVerdict} keeps the two apart, reusing Phase 5's
 * `CellVerdict` rather than restating it — `benchmark/verdict.ts` measured the need for the
 * distinction and three of its eight arms turned out to require it.
 *
 * ## What is deliberately absent
 *
 * - **A scalarizing weight.** There is no `objectiveWeights` field and no `overallScore`. If a
 *   caller wants one it can compute it from the front, in the open, having seen the front.
 * - **A "practically significant" threshold.** Same argument `benchmark/verdict.ts` makes: whether
 *   0.4 s of AWT is worth the energy it costs is not a statistical question and this module will not
 *   answer it by hiding a constant inside a verdict.
 * - **A rank order over the front.** {@link ParetoFront.front} is a *set*. Members are printed in
 *   the order supplied, never sorted by any objective, because sorting a set of mutually
 *   non-dominated points by one of its axes is a rank order wearing a table's clothes.
 */

import type {
  CandidateReport,
  MeanEstimate,
  MetricDirection,
  ReplicationObservation,
} from '../../reports/types.js';
import type { CellVerdict } from '../../benchmark/verdict.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A tuning result that cannot be trusted: overlapping tuning and holdout seed sets, an objective
 * table with a duplicate id, a candidate whose two seed sets are the same set.
 *
 * Thrown rather than returned, for the reason `ReportsError` is. Every one of these produces a
 * report that still renders, still contains intervals, and is wrong in a way no reader can see —
 * an overlapping holdout set is not a weaker guard against overfitting, it is *no* guard, and a
 * report that quietly downgraded itself would be believed.
 */
export class TuningReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TuningReportError';
  }
}

/* -------------------------------------------------------------------------- *
 * Seed sets
 * -------------------------------------------------------------------------- */

/**
 * Which half of the guard a set of replications belongs to.
 *
 * `'tuning'` is what the search optimized against and therefore what it may have overfitted to.
 * `'holdout'` is the disjoint set nothing in the search was allowed to see. CLAUDE.md § Tuning
 * discipline: "Tune on one seed set, validate on a disjoint one, or you overfit the weight vector
 * to specific passenger traces and the gain vanishes on new traffic."
 */
export type SeedSetRole = 'tuning' | 'holdout';

export const SEED_SET_ROLES: readonly SeedSetRole[] = Object.freeze(['tuning', 'holdout']);

/* -------------------------------------------------------------------------- *
 * Observations and objectives
 * -------------------------------------------------------------------------- */

/**
 * One replication as a tuning report reads it: Phase 3's {@link ReplicationObservation}, plus the
 * energy proxy.
 *
 * ## Why `energyProxy` is a separate, optional field
 *
 * Because **nothing in the simulator measures it yet.** `core`'s `RunSummary` carries waiting, ride,
 * TTD, load factor, handling capacity, interval and saturation — and no energy, no metres travelled
 * and no stop count; `REPLICATION_METRICS` in `runner/metrics.ts` projects nineteen scalars and
 * none of them is an energy proxy either. docs/06 § Term library names `distanceTravelled` as *the*
 * energy proxy and `stopCount` as its companion, but both live inside the **dispatch cost
 * function**, where they score a hypothetical assignment; neither is recorded as an outcome of a
 * finished run.
 *
 * So this field is the seam, and it is deliberately shaped as a seam rather than as a guess:
 *
 * - **Absent** means *not measured*. The energy objective is then **suppressed**, with that reason
 *   printed. It is not defaulted to zero, and it is not reconstructed from passenger records —
 *   boarding and alighting floors describe where passengers went, not where the cars went, and the
 *   difference is exactly the deadheading that idle repositioning spends energy on. A reconstructed
 *   proxy would be systematically blind to the one stage that moves it.
 * - **Present** means a caller measured it and is responsible for saying how. The report quotes it
 *   in whatever unit the {@link ObjectiveSpec} declares.
 *
 * When `core` grows a real per-run travel or energy statistic this field becomes a projection of it
 * like every other, and no signature here changes.
 */
export interface TuningObservation extends ReplicationObservation {
  /**
   * Energy consumed, or a proxy for it, over the reporting window. Lower is better.
   *
   * Absent when the run did not measure one. See the interface docstring: absence suppresses the
   * energy objective rather than defaulting it.
   */
  readonly energyProxy?: number | undefined;
}

/**
 * One axis of the Pareto front, declared as data.
 *
 * The same shape as `reports/types.ts`'s `MetricSpec` — CLAUDE.md invariant 7 applied to reporting:
 * adding a fourth objective is a table entry, and nothing downstream branches on an objective id.
 * It is a distinct type for exactly one reason: `MetricSpec.valueOf` reads a
 * {@link ReplicationObservation}, which has no energy proxy, and widening `MetricSpec` would put a
 * field on every Phase 3 report that Phase 3 cannot fill.
 *
 * {@link objectiveMetricSpec} converts one back, so every Phase 3 facility that takes a `MetricSpec`
 * — `buildCandidateReport`, `compareCandidates` — works on these unchanged.
 */
export interface ObjectiveSpec {
  readonly id: string;
  readonly label: string;
  /** SI unit for display, or `''` for a dimensionless quantity. */
  readonly unit: string;
  readonly direction: MetricDirection;
  /** Decimal places for display. */
  readonly precision: number;
  /**
   * Whether saturation invalidates this objective.
   *
   * `true` for the waiting-time axes, following `MetricSpec.invalidatedBySaturation`: a mean wait
   * under a diverging queue is not a mean of anything.
   */
  readonly invalidatedBySaturation: boolean;
  /** How to read this objective off one replication. `NaN` means "not measured", never `0`. */
  readonly valueOf: (observation: TuningObservation) => number;
  /** What the axis is, in one sentence, for the printed page. */
  readonly description: string;
}

/* -------------------------------------------------------------------------- *
 * What a search hands over
 * -------------------------------------------------------------------------- */

/**
 * One candidate's replications on one seed set.
 *
 * `observations` are in stored order and carry their seeds, which are the **pairing keys**: two
 * candidates are compared replication by replication on equal seeds, never on equal indices. Equal
 * seeds are what "the same passenger traces fed to every alternative" means operationally
 * (docs/03-traffic-and-statistics.md § Part 4), and in Phase 7's near-neighbour regime that pairing
 * is worth **99.69 % of the variance — 324× in replications**. Pairing on index instead would throw
 * all of it away and look identical on the page.
 */
export interface SeedSetEvaluation {
  /** Identity of the seed set, e.g. `tune-a` / `holdout-b`. Printed; never interpreted. */
  readonly seedSetId: string;
  readonly role: SeedSetRole;
  readonly observations: readonly TuningObservation[];
}

/**
 * One point in parameter space, evaluated.
 *
 * **This is the structural contract between `tuning/search` and `tuning/report`.** The report reads
 * nothing else from a search: not its acquisition function, not its round structure, not its
 * internal state. A candidate is an id, the parameter vector that produced it, and its replications
 * on each seed set.
 *
 * `parameters` is `Record<string, number | string | boolean>` — the four types
 * docs/06 § *The parameter schema* declares (`continuous` / `integer` / `categorical` / `boolean`),
 * keyed by the schema's own dotted `id`. The report **prints** it and never interprets it, which is
 * what keeps this module free of elevator-specific knowledge in the same way the schema keeps the
 * optimizer free of it.
 */
export interface CandidateEvaluation {
  readonly candidateId: string;
  readonly label?: string | undefined;
  /** The sampled point: parameter id (the schema's dotted path) to value. Printed, not read. */
  readonly parameters?: Readonly<Record<string, number | string | boolean>> | undefined;
  /** Replications on the set the search optimized against. */
  readonly tuning: SeedSetEvaluation;
  /**
   * Replications on the disjoint set the search never saw.
   *
   * Optional in the type and **not** optional in practice: a report built without it carries a
   * report-level note saying the central guardrail of this phase was not exercised, and no
   * candidate can reach a `'generalizes'` verdict. Optional because a mid-search diagnostic report
   * legitimately has no holdout runs yet, and forcing a caller to fabricate an empty set would be
   * worse than letting the report say what is missing.
   */
  readonly holdout?: SeedSetEvaluation | undefined;
}

/* -------------------------------------------------------------------------- *
 * Objective comparisons
 * -------------------------------------------------------------------------- */

/**
 * What one paired objective comparison is allowed to be called.
 *
 * Phase 5's `CellVerdict`, reused rather than restated. `benchmark/index.ts` states the reason
 * directly: "A later phase that re-implements those from memory will get them subtly wrong in the
 * optimistic direction." The five values and what separates `IDENTICAL` from `INDISTINGUISHABLE`
 * are documented on `benchmark/verdict.ts`.
 */
export type ObjectiveVerdict = CellVerdict;

/** One objective, compared pairwise between two candidates on one seed set. */
export interface ObjectiveComparison {
  readonly objectiveId: string;
  readonly label: string;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly precision: number;
  /** The arm whose value carries the positive sign of {@link meanDifference}. */
  readonly candidateId: string;
  readonly referenceId: string;
  readonly seedSetId: string;
  readonly role: SeedSetRole;
  /** Seeds present on both sides and usable on both sides. The paired sample. */
  readonly pairs: number;
  /**
   * Paired differences that were exactly `0`.
   *
   * The plateau detector, free of charge. `exactZeroPairs === pairs` is `IDENTICAL`: the two
   * candidates produced bit-identical runs and no replication budget changes that
   * (docs/03 § *Measured: flat plateaus, not noise*).
   */
  readonly exactZeroPairs: number;
  /** `candidate - reference`, in the objective's own unit. {@link direction} decides the sign's meaning. */
  readonly meanDifference: number;
  /** The paired-t interval on the differences. Absent when the comparison is not supportable. */
  readonly estimate?: MeanEstimate | undefined;
  /**
   * Half-width of {@link estimate} — the smallest difference this comparison could have detected.
   *
   * **This is the noise floor.** A difference below it is indistinguishable from zero by
   * definition, not by convention.
   */
  readonly noiseFloor: number;
  /** `meanDifference / referenceMean`, as a fraction. `NaN` when the reference mean is zero. */
  readonly relativeEffect: number;
  /** `Cov / sqrt(Var·Var)` across the paired samples. What CRN drives toward 1. */
  readonly correlation: number;
  /**
   * Replications the observed point estimate would need to clear zero at this confidence, from the
   * observed spread. `1` when the interval already excludes zero; `undefined` when the effect is
   * exactly zero — no `n` resolves a difference that is not there.
   */
  readonly requiredReplications: number | undefined;
  readonly verdict: ObjectiveVerdict;
  /** Why the verdict is what it is. Always present for anything other than BETTER/WORSE. */
  readonly reason?: string | undefined;
}

/** Every objective, for one ordered pair of candidates, on the seed sets available. */
export interface CandidateComparisons {
  readonly candidateId: string;
  readonly referenceId: string;
  readonly tuning: readonly ObjectiveComparison[];
  readonly holdout?: readonly ObjectiveComparison[] | undefined;
}

/* -------------------------------------------------------------------------- *
 * Pareto
 * -------------------------------------------------------------------------- */

/** A candidate reduced to one scalar per objective. `NaN` means "not measured", never `0`. */
export interface ObjectivePoint {
  readonly id: string;
  /** Objective id to scalar. */
  readonly values: Readonly<Record<string, number>>;
}

/**
 * What the dominance relation says about one ordered pair.
 *
 * `'mutually-non-dominated'` is the interesting value and covers two very different situations that
 * a front must treat identically: a genuine tradeoff (better on AWT, worse on energy) and a pair the
 * apparatus cannot separate at all. Both keep **both** candidates on the front, and the report says
 * which is which through the underlying {@link ObjectiveComparison} verdicts.
 */
export type DominanceVerdict =
  | 'dominates'
  | 'dominated-by'
  | 'mutually-non-dominated'
  | 'indeterminate';

/** One candidate's place in the front. */
export interface ParetoEntry {
  readonly candidateId: string;
  readonly point: ObjectivePoint;
  readonly onFront: boolean;
  /** Candidates that dominate this one. Empty iff {@link onFront} or {@link indeterminate}. */
  readonly dominatedBy: readonly string[];
  /**
   * Candidates this one could not be separated from on **any** objective.
   *
   * Not transitive, and not presented as a class: `a` may be indistinguishable from `b` and `b` from
   * `c` while `a` and `c` are distinguishable. Printed as pairs for that reason.
   */
  readonly indistinguishableFrom: readonly string[];
  /** True when some objective was unquotable, so this candidate cannot be placed at all. */
  readonly indeterminate: boolean;
  readonly note?: string | undefined;
}

/**
 * The non-dominated set over the objectives, with the evidence for every exclusion.
 *
 * {@link front} is a **set**, printed in input order. See the module docstring on why it is never
 * sorted.
 */
export interface ParetoFront {
  /** Every objective declared, whether or not it turned out to be measurable. */
  readonly objectiveIds: readonly string[];
  /** The axes dominance was actually decided on. */
  readonly activeObjectiveIds: readonly string[];
  /**
   * Axes dropped because **no candidate** produced a finite value for them on this seed set.
   *
   * Dropping an axis is dangerous in general — a candidate that fails to measure the objective it
   * would have lost on must not thereby reach the front — so it is only done when the axis is
   * missing *uniformly*, where by construction it can favour nobody. The asymmetric case (some
   * candidates measured it, some did not) leaves the axis active and makes the affected pairs
   * `'indeterminate'`.
   *
   * Non-empty is a loud finding, not a footnote: with today's simulator `energy` lands here on every
   * report, because nothing records it. See `pareto.ts` § the objective table.
   */
  readonly inactiveObjectiveIds: readonly string[];
  /** How dominance was decided. See `pareto.ts`. */
  readonly basis: 'pointwise' | 'paired-interval';
  readonly entries: readonly ParetoEntry[];
  /** Ids of the non-dominated candidates, in input order. */
  readonly front: readonly string[];
  /** Ids excluded because something dominates them, in input order. */
  readonly dominated: readonly string[];
  /** Ids that could not be placed, in input order. */
  readonly indeterminate: readonly string[];
  /** Pairs neither of which dominates the other *because neither could be measured against the other*. */
  readonly indistinguishablePairs: readonly IndistinguishablePair[];
}

/** Two candidates the experiment could not tell apart on any objective. */
export interface IndistinguishablePair {
  readonly a: string;
  readonly b: string;
  /** Per objective: the noise floor that swallowed the difference, and the difference itself. */
  readonly objectives: readonly ObjectiveComparison[];
  /**
   * Whether every paired difference on every objective was exactly zero.
   *
   * `true` is `IDENTICAL`: the two candidates are one candidate under two names, and the step
   * between them was below the plateau width. No replication budget separates them.
   */
  readonly identical: boolean;
}

/**
 * The best candidate on one objective — or the explicit statement that there is no single best.
 *
 * `winnerId` is populated **only** when one candidate is significantly better than every other on
 * this objective. Where the leader cannot be separated from its neighbours, `winnerId` is absent and
 * {@link tiedWith} carries the whole leading group. That is the difference between "this one won"
 * and "these could not be ranked", and collapsing it is the failure this phase is most likely to
 * commit: with hundreds of near-neighbours, the arg-min of the point estimates is very often inside
 * the noise floor of a dozen others.
 */
export interface ObjectiveWinner {
  readonly objectiveId: string;
  readonly label: string;
  readonly unit: string;
  readonly precision: number;
  readonly direction: MetricDirection;
  /** Present iff exactly one candidate is significantly better than every other. */
  readonly winnerId?: string | undefined;
  /** The interval on {@link winnerId}'s (or the leader's) own value. Never a bare mean. */
  readonly estimate?: MeanEstimate | undefined;
  /** The candidate with the best point estimate, whether or not it is a winner. */
  readonly leaderId?: string | undefined;
  /** The leading group: the leader plus everyone indistinguishable from it, in input order. */
  readonly tiedWith: readonly string[];
  readonly reason: string;
}

/* -------------------------------------------------------------------------- *
 * Holdout
 * -------------------------------------------------------------------------- */

/**
 * What a holdout set says about a tuning-set improvement.
 *
 * Six states, because "the gain did not reproduce" and "the gain reproduced smaller" and "the
 * holdout set was too small to tell" are three different findings and only the last one is fixed by
 * more replications:
 *
 * | verdict | tuning gain | holdout | shrinkage |
 * |---|---|---|---|
 * | `generalizes` | significant | significant | not significant |
 * | `degraded` | significant | significant | **significant** — real, but smaller on new traffic |
 * | `overfitted` | significant | not significant | **significant** — the gain did not survive |
 * | `unconfirmed` | significant | not significant | not significant — the holdout set could not tell |
 * | `not-selected` | not significant | — | — |
 * | `unquotable` | — | — | one side had no interval at all |
 */
export type HoldoutVerdict =
  | 'generalizes'
  | 'degraded'
  | 'overfitted'
  | 'unconfirmed'
  | 'not-selected'
  | 'unquotable';

/** One candidate, one objective, tuning set against holdout set. */
export interface HoldoutAssessment {
  readonly candidateId: string;
  readonly referenceId: string;
  readonly objectiveId: string;
  readonly label: string;
  readonly unit: string;
  readonly precision: number;
  readonly direction: MetricDirection;
  /** The improvement over the reference measured on the set the search optimized against. */
  readonly tuning: ObjectiveComparison;
  /** The same improvement measured on the disjoint set. Absent when there is no holdout set. */
  readonly holdout?: ObjectiveComparison | undefined;
  /** Tuning-set improvement in *gain* units: positive is better, whatever {@link direction} is. */
  readonly tuningGain: number;
  /** Holdout-set improvement in gain units. `NaN` without a holdout set. */
  readonly holdoutGain: number;
  /** `holdoutGain / tuningGain`. `NaN` when the tuning gain is zero — a ratio to nothing. */
  readonly retainedFraction: number;
  /**
   * The interval on `tuningGain - holdoutGain`, positive meaning the gain shrank on new traffic.
   *
   * A **Welch two-sample** interval, not a paired one: the two gains are measured on **disjoint**
   * seed sets, so they are independent by construction and there is nothing to pair. That
   * independence is the entire reason the guard works, and it is also what makes this interval the
   * right test — see `holdout.ts`.
   */
  readonly shrinkage?: MeanEstimate | undefined;
  /** Whether the holdout interval excludes zero on the improving side. */
  readonly confirmedOnHoldout: boolean;
  /** Whether {@link shrinkage} excludes zero above it: the gain is *measurably* smaller. */
  readonly gainShrankSignificantly: boolean;
  readonly verdict: HoldoutVerdict;
  /** Always present. The sentence the report prints beside the verdict. */
  readonly reason: string;
}

/* -------------------------------------------------------------------------- *
 * The report
 * -------------------------------------------------------------------------- */

/** One seed set, as the report accounts for it. */
export interface SeedSetSummary {
  readonly seedSetId: string;
  readonly role: SeedSetRole;
  /** Distinct seeds, in stored order. */
  readonly seeds: readonly string[];
  readonly replications: number;
}

/**
 * The two seed sets and the disjointness check between them.
 *
 * {@link disjoint} is `false` only when {@link buildTuningReport} was told not to throw. It is a
 * report-level fact rather than a footnote because a holdout set that overlaps the tuning set does
 * not weaken the guard, it removes it, and every `generalizes` verdict below it is meaningless.
 */
export interface SeedSetAccounting {
  readonly tuning: SeedSetSummary;
  readonly holdout?: SeedSetSummary | undefined;
  readonly disjoint: boolean;
  /** Seeds present in both sets. Empty iff {@link disjoint}. */
  readonly sharedSeeds: readonly string[];
}

/** One candidate, reported on each seed set it has replications for. */
export interface CandidateSummary {
  readonly candidateId: string;
  readonly label?: string | undefined;
  readonly parameters?: Readonly<Record<string, number | string | boolean>> | undefined;
  /** Phase 3's own candidate report, over the objectives, on the tuning set. */
  readonly tuning: CandidateReport;
  /** The same on the holdout set, when there is one. */
  readonly holdout?: CandidateReport | undefined;
}

/**
 * A tuning round, reported.
 *
 * Everything a reader needs to refuse the wrong conclusion: the front rather than a scalar, both
 * seed sets side by side rather than the flattering one, the noise floor beside every difference,
 * and the replication counts that produced them.
 */
export interface TuningReport {
  readonly title: string;
  readonly confidence: number;
  readonly objectiveIds: readonly string[];
  readonly seedSets: SeedSetAccounting;
  readonly reference: CandidateSummary;
  /** Candidates in the order supplied. Never sorted by result. */
  readonly candidates: readonly CandidateSummary[];
  readonly comparisons: readonly CandidateComparisons[];
  /** The non-dominated set over the tuning seed set. */
  readonly front: ParetoFront;
  /** The same front recomputed on the holdout set, when there is one. */
  readonly holdoutFront?: ParetoFront | undefined;
  readonly winners: readonly ObjectiveWinner[];
  readonly holdout: readonly HoldoutAssessment[];
  /** Candidates with at least one `overfitted` or `degraded` assessment, in input order. */
  readonly flaggedOverfitting: readonly string[];
  /** Candidates whose tuning-set gain was not confirmed and not measurably contradicted. */
  readonly unconfirmed: readonly string[];
  /** Report-level caveats that must be printed with the numbers, not filed away. */
  readonly notes: readonly string[];
}
