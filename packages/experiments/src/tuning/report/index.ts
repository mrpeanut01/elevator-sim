/**
 * `experiments/tuning/report` — multi-objective reporting and the anti-overfitting guards.
 *
 * The part of Phase 7 that stops a search producing a confident lie. A tuning round arrives with a
 * winner already attached; this module is what decides whether the winner is one.
 *
 * ```ts
 * import {
 *   buildTuningReport, formatTuningReport,        // the page
 *   statisticalParetoFront, bestByObjective,      // the front, and who leads each axis
 *   assessHoldout, assertDisjointSeedSets,        // the generalization guard
 * } from './tuning/report/index.js';
 *
 * const report = buildTuningReport({ reference, candidates });
 * console.log(formatTuningReport(report));
 * ```
 *
 * ## The four rules this module exists to enforce
 *
 * 1. **The Pareto front, not a score.** `(AWT, energy proxy, WT95)` are reported as a set of
 *    non-dominated candidates. Reducing energy generally costs waiting time and that tradeoff is the
 *    building operator's, not a constant to bake in (docs/06 § Guardrails; CLAUDE.md § Tuning
 *    discipline). Nothing here computes a weighted total.
 * 2. **Held-out seeds.** Tune on one seed set, validate on a **disjoint** one, and print both. A
 *    holdout set that overlaps the tuning set is refused outright rather than warned about — it is
 *    not a weaker guard, it is no guard. `holdout.ts`.
 * 3. **The noise floor.** Two candidates differing by less than the confidence-interval half-width
 *    are **indistinguishable** and are not ranked. In this phase's regime the floor is real and
 *    close: ~0.20 s, 1.3 % of AWT, at 80 % power with n = 100 (docs/03 § *Measured: the resolution
 *    limit is two numbers, not one*).
 * 4. **The plateau is a finding.** A step below the decision-flip threshold produces bit-identical
 *    runs, and `IDENTICAL` says so rather than `INDISTINGUISHABLE`. No replication budget resolves
 *    it (docs/03 § *Measured: flat plateaus, not noise*).
 *
 * ## Where this module's inputs come from
 *
 * A {@link CandidateEvaluation} is the structural contract with `tuning/search`: an id, the
 * parameter vector that produced it, and its replications on each seed set. Nothing else about a
 * search is read — not its acquisition function, not its round structure. The parameter vector is
 * printed and never interpreted, which keeps this module as free of elevator-specific knowledge as
 * the self-describing parameter schema keeps the optimizer.
 *
 * {@link runHoldoutRound} is the file that produces one, and it is the seam docs/05-roadmap.md
 * § *Standing requirement* says must have a named owner. It re-runs the finalists rather than
 * reading them out of a `SearchResult`, for two reasons that are both structural: a search's
 * `Evaluation.samples` is one scalarized number per replication with no seed, no `awtIsValid` and no
 * per-objective triple, and **no search ever runs a holdout set** — every round it runs is one
 * experiment seed shared by every candidate, which is what makes the comparison paired and is
 * exactly why those seeds cannot also be the unseen ones. `holdoutRound.test.ts` drives the whole
 * path against the real `data/` directory, so the acceptance artefact this phase is judged on is
 * produced by a code path rather than described by one.
 *
 * ## One open seam, stated rather than papered over
 *
 * **The energy axis is not measured anywhere in the simulator.** `core`'s `RunSummary` carries no
 * energy, no metres travelled and no stop count, and `runner/metrics.ts` projects nineteen scalars,
 * none of them an energy proxy; docs/06's `distanceTravelled` is a *cost-function term*, scoring a
 * hypothetical assignment, not an outcome of a finished run. So {@link TuningObservation} carries an
 * optional `energyProxy`, and with nothing supplying it the energy objective is **suppressed** on
 * every candidate with that reason printed on the page. It is not defaulted to zero (which would
 * make every candidate tie and silently restore a two-axis front) and it is not reconstructed from
 * passenger records (which describe where passengers went, not where the cars went — missing exactly
 * the deadheading stage 7 spends energy on).
 */

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

export { SEED_SET_ROLES, TuningReportError } from './types.js';

export type {
  CandidateComparisons,
  CandidateEvaluation,
  CandidateSummary,
  DominanceVerdict,
  HoldoutAssessment,
  HoldoutVerdict,
  IndistinguishablePair,
  ObjectiveComparison,
  ObjectivePoint,
  ObjectiveSpec,
  ObjectiveVerdict,
  ObjectiveWinner,
  ParetoEntry,
  ParetoFront,
  SeedSetAccounting,
  SeedSetEvaluation,
  SeedSetRole,
  SeedSetSummary,
  TuningObservation,
  TuningReport,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Pareto front and the noise floor
 * -------------------------------------------------------------------------- */

export {
  AWT_OBJECTIVE_ID,
  ENERGY_OBJECTIVE_ID,
  TUNING_OBJECTIVES,
  WT95_OBJECTIVE_ID,
  assertDistinctObjectives,
  bestByObjective,
  compareObjective,
  compareObjectives,
  dominanceOf,
  dominatesPointwise,
  isIndistinguishable,
  objectiveMetricSpec,
  objectiveMetricSpecs,
  objectivePointOf,
  objectiveVerdict,
  paretoFrontOfPoints,
  statisticalParetoFront,
} from './pareto.js';

export type {
  BestByObjectiveInput,
  CompareObjectiveOptions,
  ObjectiveArm,
  StatisticalFrontInput,
} from './pareto.js';

/* -------------------------------------------------------------------------- *
 * Held-out seeds
 * -------------------------------------------------------------------------- */

export {
  accountSeedSets,
  assertDisjointSeedSets,
  assessHoldout,
  gainOf,
  seedsOf,
  sharedSeedsOf,
  shrinkageInterval,
  summarizeSeedSet,
} from './holdout.js';

export type { HoldoutOptions } from './holdout.js';

/* -------------------------------------------------------------------------- *
 * Assembly
 * -------------------------------------------------------------------------- */

export { buildTuningReport, seedSetFromReplications } from './build.js';

export type {
  ReplicationSource,
  SeedSetFromReplicationsOptions,
  TuningReportInput,
} from './build.js';

/* -------------------------------------------------------------------------- *
 * The driver — the file the report is called from, and the only thing in the
 * repository that runs a holdout seed set. See `holdoutRound.ts`.
 * -------------------------------------------------------------------------- */

export { candidateEvaluationsOf, holdoutRoundSpec, runHoldoutRound } from './holdoutRound.js';

export type {
  CandidateEvaluationsInput,
  HoldoutRound,
  HoldoutRoundInput,
  TuningArm,
} from './holdoutRound.js';

/* -------------------------------------------------------------------------- *
 * Formatting
 * -------------------------------------------------------------------------- */

export {
  NOT_COMPARABLE_LABEL,
  formatHoldout,
  formatIndistinguishable,
  formatObjectiveComparison,
  formatObjectiveEstimate,
  formatParetoFront,
  formatSeedSets,
  formatTuningReport,
  formatWinners,
} from './format.js';
