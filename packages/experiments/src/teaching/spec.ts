/**
 * **The teaching surface — docs/14 § 4.2, as a declaration that can be refused.**
 *
 * A learned dispatcher is implemented, measured and NOT ACCEPTED three times
 * ([§ D145](../../../../DECISIONS.md), § D156, § D200). This module is not a fourth attempt at the
 * measurement; it is the thing all three lacked — a **declared training configuration**, so that
 * what a policy was shown, what it was allowed to change, what it was scored on and what it was
 * never allowed to see are properties of an object rather than of whichever study function ran.
 *
 * § 4.2 fixes six fields and four rules. The fields are {@link TeachingSpec}. The rules are here,
 * each as a refusal rather than as a sentence:
 *
 * | rule | where it is enforced |
 * |---|---|
 * | 1 — held-out traffic is disjoint **by construction** | {@link TeachingSeedPlan}: one run seed, two traffic seeds, and {@link teachingSeedSets} derives both realized sets so the disjointness is measured rather than promised |
 * | 2 — the observation set is **declared**, and its causality asserted | {@link ObservationFeature}: an id outside `core`'s own {@link SELECTOR_INPUTS} is refused, and the only admissible causality is `trailing-window` |
 * | 3 — the acceptance bar is the standard one, **with no exemption** | {@link TeachingBudget}: `verdictReplications` is refused outside `CLAUDE.md`'s 50–200 band, which is the floor `weightSetSelection.ts`'s own clamp does not have (`docs/13` hazard H1) |
 * | 4 — the output is a **weight vector** where it can be | {@link TeachingActionSpace}: every parameter id must be schema-declared *and* under the `selection.` section, so the thing learned is which shipped weight vector to run and not a new dispatcher |
 *
 * ## Why the seed plan is a run seed and two traffic seeds
 *
 * `tuning/report/holdoutRound.ts` already holds out — by running the holdout at a **different
 * experiment seed**. That changes the crowd *and* the machine at once, so a policy that failed to
 * generalize would have two candidate reasons and no way to tell them apart. docs/14 § 1.1's split
 * is what removes the ambiguity: hold the run seed, move only the traffic seed, and *"the policy
 * has never seen this traffic"* becomes a statement about traffic exactly.
 *
 * ## What this file deliberately cannot express
 *
 * **A verdict on the traffic the policy trained on.** § 4.3 names that as the definition of
 * overfitting, and the surface answers it structurally rather than with a warning: there is no
 * field here that asks for one, `runTeachingRound` computes intervals only on the holdout set, and
 * a spec whose two traffic seeds are equal is refused before anything runs. The training-side
 * number survives as a bare mean with no interval and no verdict attached, which is exactly as
 * much as it is worth.
 */

import { SELECTOR_INPUTS, type SelectorInput } from '@elevator-sim/core';

import { REPLICATION_METRICS, type ReplicationMetric } from '../runner/metrics.js';
import { replicationSeeds } from '../runner/crn.js';
import type { TrafficArmSpec } from '../runner/types.js';
import { searchSpace } from '../tuning/space/collect.js';
import type { SearchSpace } from '../tuning/space/types.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/** A spec that cannot be taught from, with the clause it failed. */
export class TeachingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeachingError';
  }
}

/* -------------------------------------------------------------------------- *
 * Observations — rule 2
 * -------------------------------------------------------------------------- */

/**
 * How a feature is allowed to be computed from the run.
 *
 * One member, and it is a vocabulary rather than a boolean for the reason `PARKING_STRATEGIES` is:
 * the next admissible causality — a lagged forecast, say — is a value here and a refusal message
 * that already names it, rather than a second field nothing reads.
 *
 * `trailing-window` means *counted over the window that has already happened*. It is what
 * `core/src/dispatch/selector.ts` implements and it is the property `benchmark/predictorLag.ts`
 * exists to catch the absence of: a policy that can see the future, or any quantity computed from
 * it, is not a policy but an oracle, and every number measured with one is worthless.
 */
export const OBSERVATION_CAUSALITIES = ['trailing-window'] as const;

export type ObservationCausality = (typeof OBSERVATION_CAUSALITIES)[number];

/** One thing the policy may see, named and with its causality stated. */
export interface ObservationFeature {
  /** One of `core`'s {@link SELECTOR_INPUTS}. Anything else is refused rather than ignored. */
  readonly id: SelectorInput;
  readonly causality: ObservationCausality;
}

/* -------------------------------------------------------------------------- *
 * The action space — rule 4
 * -------------------------------------------------------------------------- */

/**
 * The section every learnable parameter must live under.
 *
 * Invariant 7 read strictly. The `selection.` stage decides **which shipped weight vector runs**;
 * everything it can produce is a weight vector `data/dispatcher-profiles.json` already authors. A
 * teaching spec that could reach `dispatch.callType` would be teaching a policy to change the
 * passenger model mid-run, and `comparabilityOf` lists nine metrics that stop being comparable
 * across that — the run's own record would not be comparable with itself.
 */
export const ACTION_PARAMETER_PREFIX = 'selection.';

export interface TeachingActionSpace {
  readonly kind: 'weight-set-selection';
  /** Dotted schema ids, every one declared by `collectSearchSpace()` (invariant 8). */
  readonly parameterIds: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * The objective, the budget, the seeds
 * -------------------------------------------------------------------------- */

export interface TeachingObjective {
  /** The gate, and only the gate. Its interval is the one that can accept or refuse. */
  readonly gate: ReplicationMetric;
  readonly direction: 'lower-is-better';
  /**
   * Published **beside** the gate and never folded into it — § D100 for wait, § D106 for energy,
   * which is *an axis, never a score*. The gate may not appear here: a metric that is both the
   * thing judged and a thing reported beside it is a scalarization wearing two names.
   */
  readonly costs: readonly ReplicationMetric[];
  /**
   * `'census'` — the best **quotable shipped profile** at the point, chosen by the point's own
   * census **before any policy exists**. The only admissible value, because § D139's own
   * bad-criterion list names choosing the reference arm after seeing the result, and because
   * `docs/07` § 4 records `nearest-car` as a poor reference arm that beating is worth nothing.
   */
  readonly referenceArm: 'census';
}

/** `CLAUDE.md` § Statistical discipline's band, enforced here because the study clamp has no floor. */
export const MIN_VERDICT_REPLICATIONS = 50;
export const MAX_VERDICT_REPLICATIONS = 200;

export interface TeachingBudget {
  readonly censusReplications: number;
  readonly searchCandidates: number;
  readonly searchReplications: number;
  readonly resolutionReplications: number;
  /**
   * The paired `n` behind every published interval, per declared point.
   *
   * Refused outside `[50, 200]`. `docs/13` hazard H1 is why the check is here rather than assumed:
   * `runWeightSetSelectionStudy`'s budget clamp is `Math.min(requested, ceiling)` and **has no
   * lower bound**, so a small census ceiling runs the study under the floor without complaint. Ten
   * replications produced a 12 % error against the converged mean in the reference study.
   */
  readonly verdictReplications: number;
}

/**
 * **One machine, two crowds** — docs/14 § 1.1, and rule 1's whole content.
 *
 * {@link runSeed} is held across training and holdout, so the only difference between the two is
 * the traffic. {@link trainingTrafficSeed} and {@link holdoutTrafficSeed} must differ, and
 * {@link teachingSeedSets} derives both realized sets so the round can assert their disjointness
 * on the values it actually ran rather than on the two integers it was handed —
 * `runHoldoutRound`'s precedent, which re-checks realized seeds *"which is the check that holds
 * even if the derivation changes"*.
 */
export interface TeachingSeedPlan {
  readonly runSeed: number;
  readonly trainingTrafficSeed: number;
  readonly holdoutTrafficSeed: number;
}

/* -------------------------------------------------------------------------- *
 * The spec
 * -------------------------------------------------------------------------- */

/** docs/14 § 4.2's six fields, and nothing that could ask for a training-set verdict. */
export interface TeachingSpec {
  readonly id: string;
  /** Building id, resolved through `ExperimentResources.buildingsById`. */
  readonly building: string;
  /** The operating points trained against and judged at. At least one; ids distinct. */
  readonly traffic: readonly TrafficArmSpec[];
  readonly observations: readonly ObservationFeature[];
  readonly action: TeachingActionSpace;
  readonly objective: TeachingObjective;
  readonly budget: TeachingBudget;
  readonly seeds: TeachingSeedPlan;
}

/* -------------------------------------------------------------------------- *
 * Parsing
 * -------------------------------------------------------------------------- */

function refuse(message: string): never {
  throw new TeachingError(message);
}

/**
 * Validate a {@link TeachingSpec}, or refuse it by name.
 *
 * Every refusal below is one of § 4.2's four rules or one of the disciplines they cite. None of
 * them is a warning: a teaching configuration that is wrong in any of these ways produces a
 * perfectly plausible run of a policy nobody meant to train, which is the failure shape this
 * repository has shipped eleven times one level down.
 *
 * @param space the declared search space, injected so a test can narrow it. Defaults to
 *   `searchSpace()`, which derives every dimension from `core`'s own `_PARAMETERS` exports.
 */
export function parseTeachingSpec(spec: TeachingSpec, space: SearchSpace = searchSpace()): TeachingSpec {
  if (spec.id.trim() === '') refuse('A teaching spec needs an id; every figure it publishes is quoted by it.');
  if (spec.building.trim() === '') refuse(`Teaching spec "${spec.id}" names no building.`);

  /* --- the traffic templates trained against --- */
  if (spec.traffic.length === 0) {
    refuse(
      `Teaching spec "${spec.id}" declares no traffic. A policy trained against nothing has nothing to discriminate on, which is exactly what § D156 measured: the shipped template varied the level and never the directional split, so the policy learned the only signal present.`,
    );
  }
  const pointIds = new Set<string>();
  for (const point of spec.traffic) {
    if (pointIds.has(point.id)) {
      refuse(
        `Teaching spec "${spec.id}" declares the traffic point "${point.id}" twice. Two cells with one id cannot be told apart in a Holm family, and the multiplicity correction would be taken over a duplicate.`,
      );
    }
    pointIds.add(point.id);
  }

  /* --- rule 2: the observation set is declared, and its causality asserted --- */
  if (spec.observations.length === 0) {
    refuse(`Teaching spec "${spec.id}" declares no observation features. A policy that sees nothing selects nothing.`);
  }
  const seenObservations = new Set<string>();
  for (const feature of spec.observations) {
    if (!(SELECTOR_INPUTS as readonly string[]).includes(feature.id)) {
      refuse(
        `Teaching spec "${spec.id}" declares the observation "${feature.id}", which no observation supplies. Implemented: ${SELECTOR_INPUTS.join(', ')}. core's own detector removed a fourth authored input (\`timeOfDay\`) rather than faking it, and a declared feature nothing can measure is a dimension every pattern scores identically on.`,
      );
    }
    if (seenObservations.has(feature.id)) {
      refuse(`Teaching spec "${spec.id}" declares the observation "${feature.id}" twice.`);
    }
    seenObservations.add(feature.id);
    if (!(OBSERVATION_CAUSALITIES as readonly string[]).includes(feature.causality)) {
      refuse(
        `Teaching spec "${spec.id}" declares observation "${feature.id}" with causality "${feature.causality}". Admissible: ${OBSERVATION_CAUSALITIES.join(', ')}. A feature computed from anything but the window that has already happened is an oracle, and every number measured with one is worthless — benchmark/predictorLag.ts exists to catch exactly that.`,
      );
    }
  }

  /* --- rule 4: the action space is schema-declared, and it is the selection stage --- */
  if (spec.action.kind !== 'weight-set-selection') {
    refuse(`Teaching spec "${spec.id}" declares an unknown action kind "${String(spec.action.kind)}".`);
  }
  if (spec.action.parameterIds.length === 0) {
    refuse(`Teaching spec "${spec.id}" declares an empty action space, so there is nothing to learn.`);
  }
  const seenParameters = new Set<string>();
  for (const id of spec.action.parameterIds) {
    if (seenParameters.has(id)) refuse(`Teaching spec "${spec.id}" declares the action parameter "${id}" twice.`);
    seenParameters.add(id);
    if (!id.startsWith(ACTION_PARAMETER_PREFIX)) {
      refuse(
        `Teaching spec "${spec.id}" declares the action parameter "${id}", which is outside the "${ACTION_PARAMETER_PREFIX}" section. The output of teaching is a choice among the weight vectors data/dispatcher-profiles.json already authors (CLAUDE.md invariant 7); a parameter outside that section changes the dispatcher rather than choosing one.`,
      );
    }
    if (!space.ids.includes(id)) {
      refuse(
        `Teaching spec "${spec.id}" declares the action parameter "${id}", which the declared search space does not contain. Every tunable declares its schema (CLAUDE.md invariant 8), and a search over a silently smaller space reports a winner that is only optimal at whatever the missing dimension happened to be.`,
      );
    }
  }

  /* --- the objective --- */
  if (!REPLICATION_METRICS.includes(spec.objective.gate)) {
    refuse(`Teaching spec "${spec.id}" gates on "${spec.objective.gate}", which is not a replication metric.`);
  }
  if (spec.objective.direction !== 'lower-is-better') {
    refuse(`Teaching spec "${spec.id}" declares direction "${String(spec.objective.direction)}"; every metric here is lower-is-better.`);
  }
  if (spec.objective.referenceArm !== 'census') {
    refuse(
      `Teaching spec "${spec.id}" declares reference arm "${String(spec.objective.referenceArm)}". The only admissible value is "census": the reference is the best quotable shipped profile at the point, established before any policy exists, because § D139's bad-criterion list names choosing it after seeing the result.`,
    );
  }
  for (const metric of spec.objective.costs) {
    if (!REPLICATION_METRICS.includes(metric)) {
      refuse(`Teaching spec "${spec.id}" publishes the cost "${metric}", which is not a replication metric.`);
    }
    if (metric === spec.objective.gate) {
      refuse(
        `Teaching spec "${spec.id}" lists the gate metric "${metric}" among its costs. A metric that is both judged and reported beside the judgement is a scalarization wearing two names; costs go beside the gate and are never folded into it (§ D106).`,
      );
    }
  }

  /* --- rule 3: the budget band, including the floor the study clamp does not have --- */
  const positive = (value: number, field: string): void => {
    if (!Number.isSafeInteger(value) || value < 1) {
      refuse(`Teaching spec "${spec.id}" sets budget.${field} to ${String(value)}; it must be a positive integer.`);
    }
  };
  positive(spec.budget.censusReplications, 'censusReplications');
  positive(spec.budget.searchCandidates, 'searchCandidates');
  positive(spec.budget.searchReplications, 'searchReplications');
  positive(spec.budget.resolutionReplications, 'resolutionReplications');
  positive(spec.budget.verdictReplications, 'verdictReplications');
  if (
    spec.budget.verdictReplications < MIN_VERDICT_REPLICATIONS ||
    spec.budget.verdictReplications > MAX_VERDICT_REPLICATIONS
  ) {
    refuse(
      `Teaching spec "${spec.id}" sets budget.verdictReplications to ${String(spec.budget.verdictReplications)}, outside CLAUDE.md's ${String(MIN_VERDICT_REPLICATIONS)}–${String(MAX_VERDICT_REPLICATIONS)} band. Ten replications produced a 12 % error against the converged mean in the reference study, and the floor is checked here because runWeightSetSelectionStudy's own clamp is a Math.min with no lower bound (docs/13 hazard H1).`,
    );
  }

  /* --- rule 1: the two traffic seeds are declared distinct --- */
  if (spec.seeds.trainingTrafficSeed === spec.seeds.holdoutTrafficSeed) {
    refuse(
      `Teaching spec "${spec.id}" declares the same traffic seed (${String(spec.seeds.trainingTrafficSeed)}) for training and for holdout. One traffic seed is one crowd, so the "holdout" would be the training set under a second name and every generalization verdict taken on it would be vacuous.`,
    );
  }

  return spec;
}

/* -------------------------------------------------------------------------- *
 * The two seed sets, derived
 * -------------------------------------------------------------------------- */

export interface TeachingSeedSets {
  /** The realized demand seeds the policy is fitted on, in replication order. */
  readonly training: readonly bigint[];
  /** The realized demand seeds it is judged on, and has never seen. */
  readonly holdout: readonly bigint[];
  /** Measured on the realized values, never inferred from the two declared integers. */
  readonly disjoint: boolean;
  /** `true` when training and holdout run against the same machine, which is the design. */
  readonly runSeedHeld: true;
}

/**
 * Realize both traffic-seed sets and measure their disjointness.
 *
 * Both go through the runner's own {@link replicationSeeds}, which is the mapping the experiment
 * will actually use, so this is the set that runs and not a description of it. The disjointness is
 * then a **measurement over the realized values**: the two declared integers differing is
 * necessary and is not the claim, because the claim a reader cares about is that no crowd the
 * policy was fitted on reappears in the set it is judged on.
 */
export function teachingSeedSets(spec: TeachingSpec): TeachingSeedSets {
  const n = Math.max(spec.budget.verdictReplications, spec.budget.searchReplications);
  const training = replicationSeeds(spec.seeds.trainingTrafficSeed, n);
  const holdout = replicationSeeds(spec.seeds.holdoutTrafficSeed, n);
  const seen = new Set(training.map((seed) => seed.toString()));
  return Object.freeze({
    training,
    holdout,
    disjoint: holdout.every((seed) => !seen.has(seed.toString())),
    runSeedHeld: true,
  });
}
