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
  /*
   * **Player words, no repository paths** — § D234, issue #25.
   *
   * This read *"Blocked on W7 … docs/10 § 10.4 … § 5.2's goal table says the opposite"* — three
   * internal cross-references and a work-item id, printed verbatim on the Compare and Lab tabs. A
   * player has no `docs/`, no W7 and no § 5.2; what they have is a goal row that suddenly reads
   * like a bug tracker, and the honest content underneath it — *this cannot be judged from what a
   * run records* — buried in the middle.
   *
   * **Changed here rather than paraphrased at the surface.** `honesty/surfaces.ts` seeds this
   * constant *by reference* (it iterates `GOAL_BLOCKER` and pushes each non-null value), so the
   * string the sweep checks and the string a player reads are the same object. A second, tidier
   * copy at the render site would have been the classic two-answers defect: the sweep would go on
   * checking a sentence nobody sees.
   *
   * The claim itself is unchanged and is still the one that matches the code, which is the half
   * that had to survive the rewrite: the recording carries no credential on a leg.
   */
  'everyone-can-get-there':
    'Not judgeable from what a run records. A recording carries no credential on a leg, so it ' +
    'cannot tell a call nobody answered from a call nobody was allowed to answer — and scoring ' +
    'the second as though it were the first is exactly the wrong number this goal exists to catch.',
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
 * Narrowing a spec to what one replication can actually answer
 * -------------------------------------------------------------------------- */

/**
 * A {@link GoalSpec} narrowed to the specs {@link judgeReplication} can answer — **the type that
 * makes its two throws unreachable.**
 *
 * ## Why this type exists at all
 *
 * `judgeReplication` has always thrown on a spec it cannot judge, and that is the right behaviour:
 * a silent `unmeasured` would let a *blocked* goal ship looking like a *measured* one, which is the
 * exact confusion `docs/10` § 10.4 was written to stop. But "the right behaviour on a bad call" is
 * not the same as "the bad call cannot be made". Every caller in this package guarded correctly —
 * `isPerReplicationGoal(spec.kind)` at four sites — and **nothing in the types required them to**,
 * so the guard was a convention held by four separate authors reading the same docstring.
 *
 * A convention held by reading is the shape this repository has shipped as a dead seam twelve
 * times, one level over: the check exists, it is correct, and nothing makes it happen. So the
 * domain is a type now. A caller that has not narrowed does not get a runtime error on the twenty
 * seeds it was about to judge — it does not compile.
 *
 * ## The threshold is in the type, not only in the validator
 *
 * `long-waits-under` carries a `number`, never `null`. `campaign/parse.ts` already refuses an
 * authored goal that omits it, so shipped `data/` cannot produce one — but a UI assembling a spec
 * in memory never goes through that validator, and that is precisely the caller this type is for.
 * Splitting the union is what lets the compiler know the difference between the kind that takes a
 * threshold and the six that do not.
 */
export type PerReplicationGoalSpec =
  | {
      readonly kind: Exclude<PerReplicationGoalKind, 'long-waits-under'>;
      readonly threshold: number | null;
    }
  | { readonly kind: 'long-waits-under'; readonly threshold: number };

/**
 * Why a spec cannot be judged on one replication — the machine facts, not a sentence.
 *
 * Deliberately **not** prose. `goalReport.ts` and `scenario/measure.ts` each author their own
 * wording for a withheld goal, tuned to the surface it appears on, and a third authored sentence
 * here would be a third place for the same fact to drift. A caller gets the facts and composes the
 * words its own surface needs — {@link GOAL_BLOCKER} is there when the reason is a blocker.
 */
export interface GoalUnjudgeable {
  readonly judgeable: false;
  /** Why the kind is not a per-run predicate. `per-replication` here means the *threshold* is what is missing. */
  readonly judgement: GoalJudgement;
  /** {@link GOAL_BLOCKER}'s entry for the kind, so a caller need not look it up separately. */
  readonly blocker: string | null;
  /** `true` for a `long-waits-under` that declared no threshold — a judgeable kind, unjudgeable as written. */
  readonly missingThreshold: boolean;
}

export type GoalNarrowing =
  | { readonly judgeable: true; readonly spec: PerReplicationGoalSpec }
  | GoalUnjudgeable;

/**
 * The one place a {@link GoalSpec} becomes judgeable-or-not, checking **both** grounds.
 *
 * Total: every spec gets an answer and nothing throws. This is the function to call before
 * {@link judgeReplication} or {@link measureGoalRate}, and after it those two cannot fail.
 *
 * The two grounds were previously checked in different places — the kind at four call sites, the
 * threshold inside the predicate — so no single check answered *"may I judge this?"*. Now one does.
 */
export function asPerReplicationGoal(spec: GoalSpec): GoalNarrowing {
  if (!isPerReplicationGoal(spec.kind)) {
    return {
      judgeable: false,
      judgement: GOAL_JUDGEMENT[spec.kind],
      blocker: GOAL_BLOCKER[spec.kind],
      missingThreshold: false,
    };
  }
  if (spec.kind === 'long-waits-under') {
    if (spec.threshold === null) {
      return {
        judgeable: false,
        judgement: 'per-replication',
        blocker: null,
        missingThreshold: true,
      };
    }
    return { judgeable: true, spec: { kind: spec.kind, threshold: spec.threshold } };
  }
  return { judgeable: true, spec: { kind: spec.kind, threshold: spec.threshold } };
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
 * Takes a {@link PerReplicationGoalSpec}, so **a spec this cannot judge is a compile error at the
 * call site** rather than a throw twenty seeds in. Get one from {@link asPerReplicationGoal}.
 *
 * @throws Error when a caller with no types — plain JavaScript, or a `spec` cast past the compiler
 *   — reaches here with a kind no single run answers. Defence in depth, not the guard: a silent
 *   `unmeasured` would let a blocked goal ship looking like a measured one, and that is worth a
 *   throw even on a path the type system says is unreachable.
 */
export function judgeReplication(
  spec: PerReplicationGoalSpec,
  replication: BatchReplication,
): GoalOutcome {
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
    default:
      return refuseUnjudgeable(spec);
  }
}

/**
 * The `default` arm of a switch the type system already made exhaustive.
 *
 * Reached only from untyped callers. `never` in the parameter position is what keeps it honest: if
 * an eighth kind is added to {@link PerReplicationGoalSpec} and `judgeReplication` gains no case
 * for it, this line stops compiling rather than silently becoming the handler for it.
 */
function refuseUnjudgeable(spec: never): never {
  const { kind } = spec as GoalSpec;
  throw new Error(
    `"${kind}" is not judged on one replication (${GOAL_JUDGEMENT[kind] ?? 'unknown kind'}). ` +
      `${GOAL_BLOCKER[kind] ?? 'It compares two arms, so a single run cannot answer it.'} ` +
      'Narrow the spec with `asPerReplicationGoal` before judging it.',
  );
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

/**
 * `threshold` is a `number` in {@link PerReplicationGoalSpec}, so the null check below is for
 * untyped callers only — the same defence-in-depth as {@link refuseUnjudgeable}, and for the same
 * reason: judging a percentage against `null` would compare every run to `NaN` and quietly fail all
 * of them, which is a wrong number rather than an error.
 */
function longWaitsUnder(replication: BatchReplication, threshold: number): GoalOutcome {
  if ((threshold as number | null) === null) {
    throw new Error(
      '"long-waits-under" needs a threshold; the scenario declared none. `asPerReplicationGoal` ' +
        'reports this as `missingThreshold` without throwing.',
    );
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
 *
 * Takes a {@link PerReplicationGoalSpec} for the reason that type exists: this is the function a
 * caller reaches for first, it judges every replication it is given, and a spec it cannot judge
 * used to throw on the first one. Narrow with {@link asPerReplicationGoal} and it cannot.
 */
export function measureGoalRate(
  spec: PerReplicationGoalSpec,
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
