/**
 * Assembly: a search's candidates in, a {@link TuningReport} out.
 *
 * ```ts
 * const report = buildTuningReport({
 *   title: 'Round 4 — predictive-balanced neighbourhood, Garden Apartments',
 *   reference: predictiveBalanced,   // the arm every claim is measured against
 *   candidates: finalists,
 * });
 * console.log(formatTuningReport(report));
 * ```
 *
 * This file makes no statistical decisions of its own. It calls `pareto.ts` for the front and the
 * per-objective winners, `holdout.ts` for the generalization guard, and Phase 3's
 * `reports/compare.ts` for each candidate's own intervals — including its suppression rules, its
 * excluded-replication accounting and its refusal to print a bare mean. What it adds is the
 * accounting a reader needs to judge all of it: which seed sets, how many replications, whether the
 * pairing actually held, and which of the guards were exercised at all.
 *
 * ## The reference arm is a candidate too
 *
 * It goes on the front alongside everything else, and it competes for every per-objective winner.
 * Two reasons, both from measurements this project has already made:
 *
 * - docs/05-roadmap.md § Phase 7 acceptance is *"a tuned weight vector beats the hand-authored
 *   `predictive-balanced` profile on held-out seeds"*. A front that excluded the incumbent by
 *   construction would make that question unanswerable from the page.
 * - Phase 5 measured what happens when a search's arms turn out to be the incumbent under another
 *   name: three of eight arms came back **bit-identical** to `eta`. If a tuned vector is identical
 *   to the reference, the honest report is that they are one arm under two names, and that only
 *   shows up if the reference is in the comparison set.
 *
 * ## Reference arm choice is the caller's, and the wrong one costs 4× resolution
 *
 * docs/06 § *Pick a non-saturating reference arm — not `nearest-car`* is explicit and measured:
 * `nearest-car` is the only shipped profile that saturates, which capped Midtown Office at
 * **n = 287** and leaves a permanent resolution floor of about **0.8 s** — four times the ~0.20 s a
 * near-neighbour comparison reaches at n = 100 with CRN. This module cannot choose the reference,
 * but it can notice: a reference with saturated replications draws a report-level note, and its
 * waiting-time statistics are suppressed by Phase 3's own rules rather than by anything here.
 */

import { buildCandidateReport, type CandidateReportOptions } from '../../reports/compare.js';
import { observationOf } from '../../reports/reanalyze.js';
import { DEFAULT_CONFIDENCE } from '../../reports/statistics.js';
import type { ReplicationRecord } from '../../runner/types.js';
import {
  AWT_OBJECTIVE_ID,
  ENERGY_OBJECTIVE_ID,
  TUNING_OBJECTIVES,
  assertDistinctObjectives,
  bestByObjective,
  compareObjectives,
  objectiveMetricSpecs,
  statisticalParetoFront,
  type CompareObjectiveOptions,
  type ObjectiveArm,
} from './pareto.js';
import { accountSeedSets, assessHoldout, seedsOf } from './holdout.js';
import {
  TuningReportError,
  type CandidateComparisons,
  type CandidateEvaluation,
  type CandidateSummary,
  type HoldoutAssessment,
  type ObjectiveSpec,
  type SeedSetEvaluation,
  type SeedSetRole,
  type TuningObservation,
  type TuningReport,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The seam: a Phase 3 result becomes a seed set
 * -------------------------------------------------------------------------- */

/**
 * The fields this module reads off a runner replication.
 *
 * Narrower than `ReplicationRecord` on purpose, so `cell.replications` is assignable without the
 * report knowing about conservation audits or trace digests, and so a caller assembling a seed set
 * by hand needs two fields rather than fifteen.
 */
export type ReplicationSource = Pick<ReplicationRecord, 'replication' | 'summary'>;

export interface SeedSetFromReplicationsOptions {
  readonly seedSetId: string;
  readonly role: SeedSetRole;
  /**
   * How to read an energy proxy off a replication.
   *
   * Omit and the energy axis stays unmeasured — which is what the simulator currently supports, and
   * which the report says out loud rather than defaulting to zero. See `pareto.ts` § the objective
   * table.
   */
  readonly energyProxyOf?: ((replication: ReplicationSource) => number) | undefined;
}

/**
 * A Phase 3 cell's replications as a seed set this module can report on.
 *
 * **This is the integration seam, and it is named so that it has an owner.** docs/05-roadmap.md
 * § *Standing requirement* records what happens otherwise: four Phase 5 behaviours were built
 * correctly, exported, and called by nothing, because the file they had to be called *from*
 * appeared in no agent's ownership list. A reporting module whose only entry point takes a shape
 * nothing in the repository produces would fail in exactly that way — every test green, no caller.
 *
 * ```ts
 * const cell = cellOf(result, 'candidate-7');
 * const evaluation: CandidateEvaluation = {
 *   candidateId: 'candidate-7',
 *   tuning:  seedSetFromReplications(cell.replications, { seedSetId: 'tune-a', role: 'tuning' }),
 *   holdout: seedSetFromReplications(holdoutCell.replications, { seedSetId: 'hold-b', role: 'holdout' }),
 * };
 * ```
 *
 * The field mapping is `reports/reanalyze.ts`'s {@link observationOf}, reused rather than repeated:
 * two modules deriving "AWT" from two different fields of the same summary is precisely how one
 * experiment comes to be quoted under two numbers.
 */
export function seedSetFromReplications(
  replications: readonly ReplicationSource[],
  options: SeedSetFromReplicationsOptions,
): SeedSetEvaluation {
  const observations: TuningObservation[] = replications.map((replication) => {
    const energy = options.energyProxyOf?.(replication);
    return Object.freeze({
      ...observationOf(replication.summary),
      replication: replication.replication,
      ...(energy === undefined || !Number.isFinite(energy) ? {} : { energyProxy: energy }),
    });
  });
  return Object.freeze({
    seedSetId: options.seedSetId,
    role: options.role,
    observations: Object.freeze(observations),
  });
}

export interface TuningReportInput {
  readonly title?: string | undefined;
  /** The arm every claim is measured against. See the file docstring on choosing one. */
  readonly reference: CandidateEvaluation;
  /** Candidates in the order the report should print them. Never reordered by result. */
  readonly candidates: readonly CandidateEvaluation[];
  readonly objectives?: readonly ObjectiveSpec[] | undefined;
  /** Two-sided confidence level for every interval on the page. Default 0.95. */
  readonly confidence?: number | undefined;
  readonly maxInvalidFraction?: number | undefined;
  /**
   * Whether an overlapping tuning/holdout split is refused. Default `true`, and leaving it that way
   * is the difference between a guard and a decoration — see `holdout.ts`.
   */
  readonly requireDisjointSeedSets?: boolean | undefined;
  /** The acceptable half-width the stopping rule aimed at, for the convergence line. */
  readonly targetHalfWidth?: number | undefined;
  readonly replicationCap?: number | undefined;
}

/**
 * Build the report.
 *
 * @throws TuningReportError when the tuning and holdout seed sets overlap (unless
 *   `requireDisjointSeedSets` is explicitly `false`), when a candidate id repeats, or when the
 *   objective table has a duplicate id.
 */
export function buildTuningReport(input: TuningReportInput): TuningReport {
  const objectives = input.objectives ?? TUNING_OBJECTIVES;
  assertDistinctObjectives(objectives);
  const confidence = input.confidence ?? DEFAULT_CONFIDENCE;

  const everyone: readonly CandidateEvaluation[] = [input.reference, ...input.candidates];
  assertDistinctCandidateIds(everyone);

  const seedSets = accountSeedSets(everyone, {
    requireDisjoint: input.requireDisjointSeedSets ?? true,
  });

  const compareOptions: CompareObjectiveOptions = {
    confidence,
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
  };
  const reportOptions: CandidateReportOptions = {
    confidence,
    metrics: objectiveMetricSpecs(objectives),
    convergenceMetricId: objectives[0]?.id ?? AWT_OBJECTIVE_ID,
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
    ...(input.targetHalfWidth === undefined ? {} : { targetHalfWidth: input.targetHalfWidth }),
    ...(input.replicationCap === undefined ? {} : { replicationCap: input.replicationCap }),
  };

  const summaries = everyone.map((candidate) => summarize(candidate, reportOptions));
  const [reference, ...candidateSummaries] = summaries as [CandidateSummary, ...CandidateSummary[]];

  const comparisons: CandidateComparisons[] = input.candidates.map((candidate) => {
    const tuning = compareObjectives(
      tuningArmOf(candidate),
      tuningArmOf(input.reference),
      objectives,
      compareOptions,
    );
    const candidateHoldout = candidate.holdout;
    const referenceHoldout = input.reference.holdout;
    if (candidateHoldout === undefined || referenceHoldout === undefined) {
      return Object.freeze({
        candidateId: candidate.candidateId,
        referenceId: input.reference.candidateId,
        tuning,
      });
    }
    return Object.freeze({
      candidateId: candidate.candidateId,
      referenceId: input.reference.candidateId,
      tuning,
      holdout: compareObjectives(
        { candidateId: candidate.candidateId, evaluation: candidateHoldout },
        { candidateId: input.reference.candidateId, evaluation: referenceHoldout },
        objectives,
        compareOptions,
      ),
    });
  });

  const front = statisticalParetoFront({
    candidates: everyone,
    objectives,
    role: 'tuning',
    confidence,
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
  });
  const hasHoldout = everyone.every((candidate) => candidate.holdout !== undefined);
  const holdoutFront = hasHoldout
    ? statisticalParetoFront({
        candidates: everyone,
        objectives,
        role: 'holdout',
        confidence,
        ...(input.maxInvalidFraction === undefined
          ? {}
          : { maxInvalidFraction: input.maxInvalidFraction }),
      })
    : undefined;

  const winners = bestByObjective({
    candidates: everyone,
    objectives,
    role: 'tuning',
    confidence,
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
  });

  const holdout: HoldoutAssessment[] = input.candidates.flatMap((candidate) => [
    ...assessHoldout(input.reference, candidate, { objectives, ...compareOptions }),
  ]);

  const flaggedOverfitting = input.candidates
    .map((candidate) => candidate.candidateId)
    .filter((id) =>
      holdout.some(
        (assessment) =>
          assessment.candidateId === id &&
          (assessment.verdict === 'overfitted' || assessment.verdict === 'degraded'),
      ),
    );
  const unconfirmed = input.candidates
    .map((candidate) => candidate.candidateId)
    .filter(
      (id) =>
        !flaggedOverfitting.includes(id) &&
        holdout.some(
          (assessment) => assessment.candidateId === id && assessment.verdict === 'unconfirmed',
        ),
    );

  return Object.freeze({
    title: input.title ?? `Tuning round against "${input.reference.candidateId}"`,
    confidence,
    objectiveIds: Object.freeze(objectives.map((objective) => objective.id)),
    seedSets,
    reference,
    candidates: Object.freeze(candidateSummaries),
    comparisons: Object.freeze(comparisons),
    front,
    ...(holdoutFront === undefined ? {} : { holdoutFront }),
    winners,
    holdout: Object.freeze(holdout),
    flaggedOverfitting: Object.freeze(flaggedOverfitting),
    unconfirmed: Object.freeze(unconfirmed),
    notes: Object.freeze(
      notesFor({
        everyone,
        objectives,
        summaries,
        comparisons,
        hasHoldout,
        seedSetsDisjoint: seedSets.disjoint,
        sharedSeeds: seedSets.sharedSeeds,
        referenceId: input.reference.candidateId,
      }),
    ),
  });
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function assertDistinctCandidateIds(candidates: readonly CandidateEvaluation[]): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateId)) {
      throw new TuningReportError(
        `Candidate id "${candidate.candidateId}" appears twice, including the reference arm. Every comparison on this page is keyed by id, so a duplicate silently compares one of the two against itself and reports the result under the other's name.`,
      );
    }
    seen.add(candidate.candidateId);
  }
}

function tuningArmOf(candidate: CandidateEvaluation): ObjectiveArm {
  return { candidateId: candidate.candidateId, evaluation: candidate.tuning };
}

function summarize(
  candidate: CandidateEvaluation,
  options: CandidateReportOptions,
): CandidateSummary {
  const tuning = buildCandidateReport(candidate.candidateId, candidate.tuning.observations, {
    ...options,
    ...(candidate.label === undefined ? {} : { label: candidate.label }),
  });
  const holdoutEvaluation = candidate.holdout;
  return Object.freeze({
    candidateId: candidate.candidateId,
    ...(candidate.label === undefined ? {} : { label: candidate.label }),
    ...(candidate.parameters === undefined ? {} : { parameters: candidate.parameters }),
    tuning,
    ...(holdoutEvaluation === undefined
      ? {}
      : {
          holdout: buildCandidateReport(candidate.candidateId, holdoutEvaluation.observations, {
            ...options,
            ...(candidate.label === undefined ? {} : { label: candidate.label }),
          }),
        }),
  });
}

interface NotesInput {
  readonly everyone: readonly CandidateEvaluation[];
  readonly objectives: readonly ObjectiveSpec[];
  readonly summaries: readonly CandidateSummary[];
  readonly comparisons: readonly CandidateComparisons[];
  readonly hasHoldout: boolean;
  readonly seedSetsDisjoint: boolean;
  readonly sharedSeeds: readonly string[];
  readonly referenceId: string;
}

/**
 * The caveats that have to be on the page rather than in a footnote.
 *
 * Every one of these corresponds to a way this phase has been measured to go wrong, or that
 * CLAUDE.md names outright. None of them is inferred from a threshold chosen after seeing the data.
 */
function notesFor(input: NotesInput): string[] {
  const notes: string[] = [];

  if (!input.hasHoldout) {
    notes.push(
      'NO HOLDOUT SET. Every number on this page was measured on the seeds the search optimized against, so none of it is evidence that a tuned weight vector generalizes. With common random numbers the whole round shares one set of passenger traces, and with enough candidates something fits those traces better than the reference does — the paired interval cannot detect that, and a disjoint seed set is the only instrument that can (CLAUDE.md § Tuning discipline; docs/06 § Guardrails).',
    );
  }
  if (!input.seedSetsDisjoint) {
    notes.push(
      `THE HOLDOUT SET IS NOT DISJOINT: ${input.sharedSeeds.length} seed${input.sharedSeeds.length === 1 ? '' : 's'} appear in both sets. The generalization verdicts below are void — the search already optimized against those traces.`,
    );
  }

  const energyDeclared = input.objectives.some(
    (objective) => objective.id === ENERGY_OBJECTIVE_ID,
  );
  const energyMeasured = input.everyone.some((candidate) =>
    candidate.tuning.observations.some((observation) => Number.isFinite(observation.energyProxy)),
  );
  if (energyDeclared && !energyMeasured) {
    notes.push(
      'THE ENERGY AXIS IS EMPTY. No replication carried an energy proxy, so the front below is over two objectives, not three, and the wait-versus-energy tradeoff docs/06 § Guardrails exists to expose is not on this page. The simulator does not currently record energy, metres travelled or stop count as run outcomes: `RunSummary` has none of the three and `runner/metrics.ts` projects none of them. Supply `energyProxy` on each observation, or read the front as silent on energy — it is not evidence that energy is unaffected.',
    );
  }

  const referenceSeeds = seedsOf((input.everyone[0] as CandidateEvaluation).tuning);
  const unpaired = input.everyone
    .slice(1)
    .filter((candidate) => !sameSeeds(referenceSeeds, seedsOf(candidate.tuning)))
    .map((candidate) => candidate.candidateId);
  if (unpaired.length > 0) {
    notes.push(
      `Not every candidate ran on the reference's tuning seeds: ${unpaired.join(', ')}. Comparisons fall back to the shared subset, which forfeits part of the variance reduction common random numbers exist for — in this phase's near-neighbour regime that reduction is 99.69%, worth 324× in replications (docs/03 § "Measured: the reduction depends entirely on how similar the two arms are").`,
    );
  }

  const saturated = input.summaries
    .filter(
      (summary) =>
        summary.tuning.saturatedReplications > 0 ||
        (summary.holdout?.saturatedReplications ?? 0) > 0,
    )
    .map((summary) => summary.candidateId);
  if (saturated.length > 0) {
    notes.push(
      `Saturated replications present in: ${saturated.join(', ')}. Waiting-time statistics for a configuration whose queues grow without bound are suppressed, not widened. If the reference arm is among them, note docs/06 § "Pick a non-saturating reference arm": a saturating reference capped Midtown Office at n = 287 and left a permanent ~0.8 s resolution floor, four times what a near-neighbour comparison reaches at n = 100.`,
    );
  }

  const identical = input.comparisons.filter((comparison) =>
    comparison.tuning.every((objective) => objective.verdict === 'IDENTICAL'),
  );
  if (identical.length > 0) {
    notes.push(
      `${identical.length} candidate${identical.length === 1 ? '' : 's'} produced bit-identical runs to ${input.referenceId} on every objective (${identical.map((comparison) => comparison.candidateId).join(', ')}). That is a plateau, not a near miss: the step taken was below the width at which a weight change flips a dispatch decision, and no replication budget resolves it. Increase the step — docs/03 measured the floor at ~0.03 on distanceTravelled, and it is per-term, per-building and per-traffic (docs/03 § "Measured: flat plateaus, not noise").`,
    );
  }

  const indistinguishable = input.comparisons.filter((comparison) =>
    comparison.tuning.some(
      (objective) =>
        objective.objectiveId === AWT_OBJECTIVE_ID && objective.verdict === 'INDISTINGUISHABLE',
    ),
  );
  if (indistinguishable.length > 0) {
    notes.push(
      `${indistinguishable.length} candidate${indistinguishable.length === 1 ? '' : 's'} could not be distinguished from ${input.referenceId} on AWT. That is a result, not a missing one: the difference is smaller than this experiment can measure, and the required replication counts are printed beside each.`,
    );
  }

  return notes;
}

function sameSeeds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((seed) => set.has(seed));
}
