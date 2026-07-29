/**
 * The goal kinds of `docs/10-experience-layer-contract.md` § 5.2, as predicates over one
 * replication — and the classification **R12** applies to their across-seed pass rates.
 *
 * ## What R12 actually says, and what it implies
 *
 * > *"Before a goal ships as single-run, run it over at least 20 seeds on its own scenario and
 * > publish the pass rate in the scenario file beside the goal. A pass rate of 0 or 1 makes it a
 * > statement about the configuration — state it in the brief instead. Anything in between makes
 * > it a batch goal."*
 *
 * That trichotomy is **exhaustive over `[0, 1]`**, so applied literally it empties the
 * single-run goal category: a rate of 0 or 1 is a configuration fact, and everything else is a
 * batch goal. That is not a reading this module invented to be tidy — it is what the rule says,
 * and {@link GoalDisposition} has no `single-run` member because there is nothing for it to hold.
 * The consequence is stated rather than absorbed: a campaign built on § 5.2's table is a campaign
 * of **batch goals and briefing facts**, and the measured table in `data/scenario-goals.json` is
 * the evidence for which is which, scenario by scenario.
 *
 * ## Five of the seven kinds are predicates over one run; two are not
 *
 * | kind | judgement | why |
 * |---|---|---|
 * | `deliver-everyone` | per-replication | `counts.unserved === 0`, i.e. `unservedFraction === 0` |
 * | `no-divergence` | per-replication | `saturated === false`; § 5.2 already calls it a batch goal, and its rate is measured here by the same instrument as the rest so the method can be checked against a case whose answer is already agreed |
 * | `nobody-abandoned` | per-replication | `serviceLevel.verdict !== 'starved'` |
 * | `answer-the-demand` | per-replication | `personsPer5Min >= offeredPer5Min` — § 3.5's paired bar, both halves |
 * | `long-waits-under` | per-replication | `waiting.pctOverLongWait <= threshold` |
 * | `beat-the-baseline` | batch-only | a paired-t interval on a **difference between two arms**. There is no predicate over one replication to take a rate of; R2 already makes it a batch goal and no measurement here can change that |
 * | `everyone-can-get-there` | blocked | § 10.4: `VizLeg` carries no `credentialGroup`, so the recording cannot distinguish *"nobody came"* from *"nobody may come"*. § 5.2's table says it is checkable and § 10.4 says it is not; **§ 10.4 matches the code.** Blocked on W7 |
 *
 * ## Why the predicates read a {@link BatchReplication} and not a `RunSummary`
 *
 * Because the thing that produces twenty of them is W3's runner, and a second runner is the
 * defect this lane exists to avoid. Every field a predicate below reads is one the batch already
 * copies off the run's own summary — R9: *"one source of truth for 'may I show this'"*, and
 * nothing here recomputes saturation, censoring or a service level from anything.
 *
 * ## R1 holds by construction
 *
 * Not one predicate reads `awtS`, `wt95S` or `ttdMeanS` — the three fields R1 names. A goal that
 * did would be unjudgeable on the majority of shipped cells (**M1**: 14 of 60), and § 9.5 makes
 * that a *scenario-authoring* error caught at load. {@link GOAL_READS} is the machine-checkable
 * form of that claim and `goals.test.ts` asserts it against R1's own list.
 */

import type { BatchMetric, BatchReplication } from '../batch/types.js';

/* -------------------------------------------------------------------------- *
 * The kinds
 * -------------------------------------------------------------------------- */

/** § 5.2's table, in its own order. */
export const GOAL_KINDS = [
  'deliver-everyone',
  'no-divergence',
  'nobody-abandoned',
  'answer-the-demand',
  'long-waits-under',
  'everyone-can-get-there',
  'beat-the-baseline',
] as const;

export type GoalKind = (typeof GOAL_KINDS)[number];

/**
 * How a kind can be judged at all.
 *
 * - `per-replication` — there is a predicate over one run, so there is a pass rate to measure.
 * - `batch-only` — the claim is about a *difference between arms*. No single run answers it.
 * - `blocked` — the recording does not carry the fact. Named, with its blocker, rather than
 *   quietly dropped: § 5.2's table and § 10.4 contradict each other and § 10.4 is the one that
 *   matches the code.
 */
export type GoalJudgement = 'per-replication' | 'batch-only' | 'blocked';

export const GOAL_JUDGEMENT: Readonly<Record<GoalKind, GoalJudgement>> = {
  'deliver-everyone': 'per-replication',
  'no-divergence': 'per-replication',
  'nobody-abandoned': 'per-replication',
  'answer-the-demand': 'per-replication',
  'long-waits-under': 'per-replication',
  'everyone-can-get-there': 'blocked',
  'beat-the-baseline': 'batch-only',
};

/**
 * Why a blocked kind is blocked, in the words a reader gets. Empty for every kind that is not.
 *
 * A `Record` over every kind rather than a lookup that may miss: an eighth kind added without a
 * decision about this is a compile error, which is the only way the answer stays one somebody
 * gave.
 */
export const GOAL_BLOCKER: Readonly<Record<GoalKind, string | null>> = {
  'deliver-everyone': null,
  'no-divergence': null,
  'nobody-abandoned': null,
  'answer-the-demand': null,
  'long-waits-under': null,
  'everyone-can-get-there':
    'Blocked on W7. The recording carries no credential on a leg, so it cannot tell a call ' +
    'nobody answered from a call nobody was allowed to answer — docs/10 § 10.4, which is the ' +
    'statement that matches the code. § 5.2’s goal table says the opposite and is wrong ' +
    'about it.',
  'beat-the-baseline': null,
};

export type PerReplicationGoalKind = Extract<
  GoalKind,
  'deliver-everyone' | 'no-divergence' | 'nobody-abandoned' | 'answer-the-demand' | 'long-waits-under'
>;

export function isPerReplicationGoal(kind: GoalKind): kind is PerReplicationGoalKind {
  return GOAL_JUDGEMENT[kind] === 'per-replication';
}

/**
 * Which kinds take a threshold, and which have none to take.
 *
 * `long-waits-under` is the only one, and § 5.2 already flags what that costs: *"a coin flip
 * whose rate is set entirely by the threshold the scenario author picks — which makes the
 * threshold, not the player, the thing being tested."* The measurement in `data/` therefore
 * carries the threshold beside the rate, because the rate is meaningless without it.
 */
export const GOAL_TAKES_THRESHOLD: Readonly<Record<GoalKind, boolean>> = {
  'deliver-everyone': false,
  'no-divergence': false,
  'nobody-abandoned': false,
  'answer-the-demand': false,
  'long-waits-under': true,
  'everyone-can-get-there': false,
  'beat-the-baseline': false,
};

/**
 * The {@link BatchMetric}s each per-replication kind reads, so **R1** is checkable rather than
 * claimed.
 *
 * A kind that reads no metric at all (it reads a flag or a verdict instead) maps to the empty
 * array, which is a stronger statement than an absent key.
 */
export const GOAL_READS: Readonly<Record<PerReplicationGoalKind, readonly BatchMetric[]>> = {
  'deliver-everyone': ['unservedFraction'],
  'no-divergence': [],
  'nobody-abandoned': [],
  'answer-the-demand': ['personsPer5Min'],
  'long-waits-under': ['pctOverLongWait'],
};

/* -------------------------------------------------------------------------- *
 * A goal, as a scenario carries it
 * -------------------------------------------------------------------------- */

/** One goal instance: a kind, and the parameter it takes if it takes one. */
export interface GoalSpec {
  readonly kind: GoalKind;
  /**
   * `long-waits-under`'s percentage ceiling, `null` for every other kind.
   *
   * `null` rather than absent so that a reader of a scenario file sees the field and its answer.
   */
  readonly threshold: number | null;
}

/** `long-waits-under (≤ 10 %)` — the form the reader and the published table both use. */
export function goalLabel(spec: GoalSpec): string {
  return spec.threshold === null
    ? spec.kind
    : `${spec.kind} (≤ ${String(spec.threshold)} %)`;
}

/* -------------------------------------------------------------------------- *
 * Judging one replication
 * -------------------------------------------------------------------------- */

/**
 * What one run says about one goal.
 *
 * `unmeasured` is the third state and it is **not** a fail. § D158 found the case on real data:
 * `pctOverLongWait` is a percentage of the rides served in the reporting window, and on Garden
 * Apartments some seeds serve none, so the quantity was never measured. Scoring that as a failure
 * would count a run that did nothing wrong as a loss; scoring it as a pass would count a run
 * nobody was served in as a win.
 */
export type GoalOutcome = 'pass' | 'fail' | 'unmeasured';

/**
 * Judge one replication against one goal.
 *
 * @throws Error when `spec.kind` is not a per-replication kind — a caller that reaches here with
 *   `beat-the-baseline` or `everyone-can-get-there` has a bug that a silent `unmeasured` would
 *   hide, and hiding it is how a blocked goal ships looking like a measured one.
 */
export function judgeReplication(spec: GoalSpec, replication: BatchReplication): GoalOutcome {
  switch (spec.kind) {
    case 'deliver-everyone':
      return compareToZero(replication.metrics.unservedFraction);
    case 'no-divergence':
      return replication.saturated ? 'fail' : 'pass';
    case 'nobody-abandoned':
      return replication.serviceLevelVerdict === 'starved' ? 'fail' : 'pass';
    case 'answer-the-demand':
      return answersTheDemand(replication);
    case 'long-waits-under':
      return longWaitsUnder(replication, spec.threshold);
    case 'everyone-can-get-there':
    case 'beat-the-baseline':
      throw new Error(
        `"${spec.kind}" is not judged on one replication (${GOAL_JUDGEMENT[spec.kind]}). ` +
          `${GOAL_BLOCKER[spec.kind] ?? 'It compares two arms, so a single run cannot answer it.'}`,
      );
  }
}

/** `counts.unserved === 0`, through the fraction the batch carries. */
function compareToZero(unservedFraction: number | null): GoalOutcome {
  if (unservedFraction === null) return 'unmeasured';
  return unservedFraction === 0 ? 'pass' : 'fail';
}

/**
 * § 3.5's paired bar, as a predicate: were at least as many people carried as arrived?
 *
 * Both halves must be measured. An offered figure with no carried figure is not a zero — it is a
 * run that recorded no handling capacity, and § D154's rule about `NaN`-not-zero is the same rule
 * one level up.
 */
function answersTheDemand(replication: BatchReplication): GoalOutcome {
  const carried = replication.metrics.personsPer5Min;
  const offered = replication.offeredPer5Min;
  if (carried === null || offered === null) return 'unmeasured';
  return carried >= offered ? 'pass' : 'fail';
}

function longWaitsUnder(replication: BatchReplication, threshold: number | null): GoalOutcome {
  if (threshold === null) {
    throw new Error('"long-waits-under" needs a threshold; the scenario declared none.');
  }
  const pct = replication.metrics.pctOverLongWait;
  if (pct === null) return 'unmeasured';
  return pct <= threshold ? 'pass' : 'fail';
}

/* -------------------------------------------------------------------------- *
 * R12's classification
 * -------------------------------------------------------------------------- */

/**
 * What a measured pass rate makes a goal.
 *
 * - `constant-pass` — every seed passed. **Not a goal.** The player cannot move it.
 * - `constant-fail` — no seed passed. **Not a goal**, for the same reason from the other side.
 * - `variable` — strictly between. R12: *"anything in between makes it a batch goal."*
 * - `unjudgeable` — at least one seed could not be judged at all. See {@link GoalRate} on why the
 *   judgeable ones are not simply counted instead.
 */
export type GoalRateClass = 'constant-pass' | 'constant-fail' | 'variable' | 'unjudgeable';

/**
 * What may be **done** with a goal, given its class. This is R12's disposition, not a hint.
 *
 * There is no `single-run` member. See the module docstring: R12's trichotomy is exhaustive, so
 * the category is empty by construction rather than by this lane's choice.
 */
export type GoalDisposition = 'batch' | 'configuration-fact' | 'not-shippable';

export const DISPOSITION_OF: Readonly<Record<GoalRateClass, GoalDisposition>> = {
  variable: 'batch',
  'constant-pass': 'configuration-fact',
  'constant-fail': 'configuration-fact',
  unjudgeable: 'not-shippable',
};

/**
 * One goal's across-seed pass rate on one scenario.
 *
 * Every field is a count except {@link rate}, which is the quotient and is `null` when there is
 * nothing to divide. **R13**: the rate never travels without its `n`, which is why `n` is a field
 * and not a footnote, and why {@link sentence} restates the count rather than the percentage.
 */
export interface GoalRate {
  readonly kind: GoalKind;
  readonly threshold: number | null;
  /** Replications judged. `passes + fails + unmeasured`. */
  readonly n: number;
  readonly passes: number;
  readonly fails: number;
  /**
   * Replications on which the quantity was never measured.
   *
   * **Not excluded from the denominator, and that is the decision.** § D158 chose complete-case
   * or nothing for a partly suppressed batch because dropping the pairs that fell out is
   * *selection on the outcome* — the runs that fall out are the hard ones. A pass rate computed
   * over "the seeds we could judge" has exactly that bias, and it would carry an honest-looking
   * `n` while having it, which § D158 calls *"worse than a blank, not better."* So one
   * unjudgeable seed makes the whole rate {@link GoalRateClass} `unjudgeable`.
   */
  readonly unmeasured: number;
  /** `passes / n`, or `null` when `n` is `0` or any seed was unjudgeable. */
  readonly rate: number | null;
  readonly rateClass: GoalRateClass;
  readonly disposition: GoalDisposition;
  /** A frequency over runs, with its denominator. No probability word — R10. */
  readonly sentence: string;
}

/**
 * Take one goal's pass rate over a set of replications.
 *
 * Pure. The replications come from `runBatch` — one arm of one batch, which is *"at least 20
 * seeds on its own scenario"* in the form the shipped runner produces it.
 */
export function measureGoalRate(
  spec: GoalSpec,
  replications: readonly BatchReplication[],
): GoalRate {
  let passes = 0;
  let fails = 0;
  let unmeasured = 0;
  for (const replication of replications) {
    const outcome = judgeReplication(spec, replication);
    if (outcome === 'pass') passes += 1;
    else if (outcome === 'fail') fails += 1;
    else unmeasured += 1;
  }
  const n = replications.length;
  const rateClass = classify(n, passes, unmeasured);
  const rate = rateClass === 'unjudgeable' || n === 0 ? null : passes / n;
  return {
    kind: spec.kind,
    threshold: spec.threshold,
    n,
    passes,
    fails,
    unmeasured,
    rate,
    rateClass,
    disposition: DISPOSITION_OF[rateClass],
    sentence: rateSentence(spec, n, passes, unmeasured, rateClass),
  };
}

function classify(n: number, passes: number, unmeasured: number): GoalRateClass {
  if (n === 0 || unmeasured > 0) return 'unjudgeable';
  if (passes === n) return 'constant-pass';
  if (passes === 0) return 'constant-fail';
  return 'variable';
}

/**
 * The reader's sentence.
 *
 * A frequency over runs with the real denominator, per **R10** and **R13** clause two: never
 * *"1 in 20"* over a sample that has no twentieth member, and never a likelihood word. A constant
 * says so in those words, because § 5.2's whole finding is that three of its five single-run
 * goals are constants and *"a constant is not a goal"* is the sentence a scenario author needs to
 * read.
 */
function rateSentence(
  spec: GoalSpec,
  n: number,
  passes: number,
  unmeasured: number,
  rateClass: GoalRateClass,
): string {
  const label = goalLabel(spec);
  if (n === 0) return `${label}: no replications were run, so there is no pass rate.`;
  if (rateClass === 'unjudgeable') {
    return (
      `${label}: ${String(unmeasured)} of ${String(n)} runs never measured the quantity this ` +
      'goal is about, so there is no pass rate. The runs that could be judged are not counted ' +
      'on their own: the ones that fall out are the hard ones, and a rate over the survivors ' +
      'would understate the difficulty while showing an honest-looking denominator.'
    );
  }
  if (rateClass === 'constant-pass') {
    return (
      `${label}: passed in all ${String(n)} of ${String(n)} runs. That is a fact about this ` +
      'configuration, not a goal — nothing the player changes can move it, so it belongs in the ' +
      'briefing.'
    );
  }
  if (rateClass === 'constant-fail') {
    return (
      `${label}: passed in 0 of ${String(n)} runs. That is a fact about this configuration, not ` +
      'a goal — it is decided before the player touches a dial, so it belongs in the briefing.'
    );
  }
  return (
    `${label}: passed in ${String(passes)} of ${String(n)} runs. It is judged over a batch, and ` +
    'the fraction is what is reported — one run of this configuration decides nothing.'
  );
}
