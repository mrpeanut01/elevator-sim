/**
 * Measuring a goal's across-seed pass rate on a scenario — **R12**'s mechanism, built on W3.
 *
 * ## No second runner, and no second estimator
 *
 * Every replication here comes from `batch/runBatch.ts`, unchanged: one arm, N replications, the
 * seeds from `experiments`' shipped `replicationSeed` and the pairing audited by the runner's own
 * CRN check. A pass rate is a **count over runs**, so there is no interval to compute and nothing
 * for a second estimator to be a second source of truth about — the arithmetic is `passes / n`
 * and it is reported as `passes` **of** `n`, per R10 and R13.
 *
 * ## Two seed sets, because one operating point is how this project produces confident nonsense
 *
 * CLAUDE.md § Tuning discipline: *"Tune on one seed set, validate on a disjoint one."*
 * § D151/§ D156 is the same lesson at wave scale. So each goal is measured **twice** — on the
 * scenario's tuning seeds and again on a disjoint holdout set — and a goal whose classification
 * differs between them is withheld rather than shipped on the first answer. That check can only
 * make the shippable set smaller.
 *
 * ## The batch size is the one that will actually be run
 *
 * § D158's operational finding, inherited by name: *"a demand level chosen because every arm is
 * quotable must be verified at the batch size that will actually be run… a level validated at
 * n = 20 can suppress at n = 50."* R12's floor is twenty seeds; both sets here run **fifty**,
 * which is CLAUDE.md's own budget and the size a campaign batch will be. `candidates.ts` carries
 * the second reason the two sets are the *same* size, which is that unequal ones manufacture
 * disagreements out of the denominator. Both counts are published beside the rate.
 */

import type {
  PublishedGoalRecord,
  PublishedRate,
  PublishedScenario,
} from './published.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchReplication, BatchRequest, BatchResources } from '../batch/types.js';
import {
  GOAL_BLOCKER,
  GOAL_JUDGEMENT,
  goalLabel,
  isPerReplicationGoal,
  measureGoalRate,
  type GoalDisposition,
  type GoalRate,
  type GoalSpec,
} from './goals.js';

/* -------------------------------------------------------------------------- *
 * What is being measured
 * -------------------------------------------------------------------------- */

/** A named set of replication seeds, as a master seed and a count. */
export interface SeedSet {
  /** What the set is called in the published record. Provenance, not decoration. */
  readonly name: string;
  /** Master seed, decimal string, exactly as `BatchRequest.seed`. */
  readonly seed: string;
  readonly replications: number;
}

/**
 * The configuration a goal is measured against — everything `traceKeyOf` reads, plus the arm.
 *
 * This is § 5.2's scenario **minus** its prose and its progression: the fields a run is a function
 * of. T65's campaign file carries the brief, the stage order and the editable dimensions on top of
 * exactly these.
 */
export interface GoalScenario {
  readonly id: string;
  readonly name: string;
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly durationS: number;
  /** `null` for the building's own traffic profile. § 5.2's `traffic` patch, in its one field. */
  readonly arrivalRatePctPop5min: number | null;
  readonly tuningSeeds: SeedSet;
  /** Disjoint from {@link tuningSeeds}. Asserted, not assumed — see `measure.test.ts`. */
  readonly holdoutSeeds: SeedSet;
  /** Every goal kind this scenario is a candidate for, with its threshold. */
  readonly candidateGoals: readonly GoalSpec[];
}

/* -------------------------------------------------------------------------- *
 * The result
 * -------------------------------------------------------------------------- */

/** One goal on one scenario, measured on both seed sets. */
export interface MeasuredGoal {
  readonly spec: GoalSpec;
  readonly tuning: GoalRate;
  readonly holdout: GoalRate;
  /**
   * Whether the holdout set reached the same classification as the tuning set.
   *
   * `false` is a **finding**, not a nuisance: it says the tuning set's answer did not generalise
   * to twenty seeds it never saw, which is exactly what a holdout set is for.
   */
  readonly holdoutAgrees: boolean;
  /** The tuning set's disposition, or `not-shippable` when the holdout disagreed with it. */
  readonly disposition: GoalDisposition;
  /** Why this goal ends up where it does, in one sentence. */
  readonly verdict: string;
}

export interface MeasuredScenario {
  readonly scenario: GoalScenario;
  /** Every candidate that has a per-replication predicate, in the scenario's own order. */
  readonly measured: readonly MeasuredGoal[];
  /**
   * Candidates with no per-replication predicate, named with the reason **and a disposition**.
   *
   * Two kinds, and they do **not** get the same answer, which the first draft of this lane got
   * wrong:
   *
   * - `beat-the-baseline` has no pass rate because it compares two arms — and § 5.2 already ships
   *   it **as a batch goal** for exactly that reason. R12 is a rule about goals judged on *one
   *   run*; a goal that was never one is not demoted by it. Disposition `batch`, no counts.
   * - `everyone-can-get-there` has no pass rate because the recording cannot answer it at all
   *   (§ 10.4, blocked on W7). Disposition `not-shippable`.
   *
   * Both are reported rather than dropped, because a goal that silently vanishes from a
   * measurement table looks exactly like a goal that passed it.
   */
  readonly unmeasurable: readonly {
    readonly spec: GoalSpec;
    readonly disposition: GoalDisposition;
    readonly reason: string;
  }[];
}

/* -------------------------------------------------------------------------- *
 * The measurement
 * -------------------------------------------------------------------------- */

export interface MeasureOptions {
  /** Called after each seed set lands, so a driver can say where it is. */
  readonly onSeedSet?: ((name: string, replications: number) => void) | undefined;
}

/**
 * Run both seed sets and take every candidate goal's pass rate on each.
 *
 * One arm per batch: a pass rate is a property of **one** configuration, and R2's *"a score is a
 * property of a run, never of a dispatcher"* is about comparing arms, which this does not do. The
 * comparison goal (`beat-the-baseline`) is the one that needs two, and it is in
 * {@link MeasuredScenario.unmeasurable} for that reason.
 */
export function measureScenario(
  scenario: GoalScenario,
  resources: BatchResources,
  options: MeasureOptions = {},
): MeasuredScenario {
  const tuningReplications = runSeedSet(scenario, scenario.tuningSeeds, resources, options);
  const holdoutReplications = runSeedSet(scenario, scenario.holdoutSeeds, resources, options);

  const measured: MeasuredGoal[] = [];
  const unmeasurable: { spec: GoalSpec; disposition: GoalDisposition; reason: string }[] = [];

  for (const spec of scenario.candidateGoals) {
    if (!isPerReplicationGoal(spec.kind)) {
      unmeasurable.push({
        spec,
        disposition: GOAL_JUDGEMENT[spec.kind] === 'batch-only' ? 'batch' : 'not-shippable',
        reason: unmeasurableReason(spec),
      });
      continue;
    }
    const tuning = measureGoalRate(spec, tuningReplications);
    const holdout = measureGoalRate(spec, holdoutReplications);
    const holdoutAgrees = tuning.rateClass === holdout.rateClass;
    measured.push({
      spec,
      tuning,
      holdout,
      holdoutAgrees,
      disposition: holdoutAgrees ? tuning.disposition : 'not-shippable',
      verdict: verdictFor(spec, tuning, holdout, holdoutAgrees),
    });
  }

  return { scenario, measured, unmeasurable };
}

function runSeedSet(
  scenario: GoalScenario,
  seeds: SeedSet,
  resources: BatchResources,
  options: MeasureOptions,
): readonly BatchReplication[] {
  const request: BatchRequest = {
    buildingId: scenario.buildingId,
    seed: seeds.seed,
    durationS: scenario.durationS,
    replications: seeds.replications,
    arms: [{ armId: 'scenario', dispatcherProfileId: scenario.dispatcherProfileId }],
    arrivalRatePctPop5min: scenario.arrivalRatePctPop5min,
  };
  const result = runBatch(request, resources);
  options.onSeedSet?.(seeds.name, seeds.replications);
  return result.arms[0]?.replications ?? [];
}

function unmeasurableReason(spec: GoalSpec): string {
  if (GOAL_JUDGEMENT[spec.kind] === 'batch-only') {
    return (
      'Judged on a difference between two arms, so no single run answers it and there is no ' +
      'across-seed pass rate to take. It ships as a batch goal, which is what § 5.2 already ' +
      'made it, and R12 — a rule about goals judged on one run — does not reach it.'
    );
  }
  return (
    GOAL_BLOCKER[spec.kind] ??
    'Not checkable from the recording as it stands, so it cannot be measured, let alone shipped.'
  );
}

function verdictFor(
  spec: GoalSpec,
  tuning: GoalRate,
  holdout: GoalRate,
  holdoutAgrees: boolean,
): string {
  const label = goalLabel(spec);
  const counts =
    `${String(tuning.passes)} of ${String(tuning.n)} on the tuning seeds and ` +
    `${String(holdout.passes)} of ${String(holdout.n)} on the holdout seeds`;
  if (!holdoutAgrees) {
    return (
      `${label}: withheld. It passed ${counts}, which are two different kinds of answer ` +
      `(${tuning.rateClass} against ${holdout.rateClass}). A classification that does not ` +
      'survive a disjoint seed set is not one to ship a level on.'
    );
  }
  if (tuning.disposition === 'configuration-fact') {
    return (
      `${label}: a fact about this configuration, not a goal — ${counts}. It goes in the ` +
      'briefing, where it is true and interesting, rather than on the scoreboard, where it ' +
      'would be a win or a loss the player never earned.'
    );
  }
  if (tuning.disposition === 'not-shippable') {
    /* `sentence` already opens with the label; prefixing it again printed it twice. */
    return `Not shippable here. ${tuning.sentence}`;
  }
  return `${label}: a batch goal, judged over the scenario's replications — ${counts}.`;
}

/* -------------------------------------------------------------------------- *
 * Rendering a measurement into the published record
 * -------------------------------------------------------------------------- */

/**
 * Turn a measurement into the shape `data/scenario-goals.json` carries.
 *
 * The bucket a record lands in is a **function of its measured rate**, computed here in one
 * place, and `validatePublishedGoalRates` re-derives the same function over the file so a
 * hand-edit that moves a record cannot survive. Nothing chooses a bucket by hand.
 */
export function publishedScenarioFor(measured: MeasuredScenario): PublishedScenario {
  const goals: PublishedGoalRecord[] = [];
  const configurationFacts: PublishedGoalRecord[] = [];
  const withheld: PublishedGoalRecord[] = [];

  for (const goal of measured.measured) {
    const record: PublishedGoalRecord = {
      kind: goal.spec.kind,
      threshold: goal.spec.threshold,
      disposition: goal.disposition,
      tuning: publishedRate(goal.tuning),
      holdout: publishedRate(goal.holdout),
      holdoutAgrees: goal.holdoutAgrees,
      reason: goal.verdict,
    };
    if (goal.disposition === 'batch') goals.push(record);
    else if (goal.disposition === 'configuration-fact') configurationFacts.push(record);
    else withheld.push(record);
  }

  for (const { spec, disposition, reason } of measured.unmeasurable) {
    const record: PublishedGoalRecord = {
      kind: spec.kind,
      threshold: spec.threshold,
      disposition,
      tuning: null,
      holdout: null,
      holdoutAgrees: null,
      reason: `${goalLabel(spec)}: ${reason}`,
    };
    if (disposition === 'batch') goals.push(record);
    else withheld.push(record);
  }

  const { scenario } = measured;
  return {
    id: scenario.id,
    name: scenario.name,
    buildingId: scenario.buildingId,
    dispatcherProfileId: scenario.dispatcherProfileId,
    durationS: scenario.durationS,
    arrivalRatePctPop5min: scenario.arrivalRatePctPop5min,
    tuningSeeds: { ...scenario.tuningSeeds },
    holdoutSeeds: { ...scenario.holdoutSeeds },
    goals,
    configurationFacts,
    withheld,
  };
}

/** Counts only. The quotient is derived at read time — see `published.ts`. */
function publishedRate(rate: GoalRate): PublishedRate {
  return {
    n: rate.n,
    passes: rate.passes,
    fails: rate.fails,
    unmeasured: rate.unmeasured,
    rateClass: rate.rateClass,
  };
}
