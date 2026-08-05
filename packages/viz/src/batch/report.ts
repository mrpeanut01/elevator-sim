/**
 * Turning a batch into sentences a reader may act on, without any of them being a lie —
 * `docs/10-experience-layer-contract.md` § 11 **W3**, § 1 **R1/R3/R10/R11/R13**.
 *
 * ## One estimator, imported
 *
 * `pairedDifferenceEstimate` and `intervalContainsZero` come from `experiments/browser`. Nothing
 * statistical is computed in this file. That is the point of the barrel: *"a batch that renders a
 * mean must not re-implement the paired-t interval … is only enforceable if the arithmetic is the
 * same arithmetic"*, and `intervalContainsZero` is *"the one line between a paired interval and
 * the overlap fallacy."* Two separate intervals are never compared here — the only interval in
 * this file is the interval **on the difference**.
 *
 * ## The suppression rule, which is the real design decision
 *
 * A batch of 50 will contain replications whose own summary refuses to stand behind a mean, on any
 * of `awtIsValid`'s four grounds. Measured on this repository's own data: Garden Apartments under
 * `collective` at 900 s gives **47 of 50**; Secure Tower gives **7 of 50**; Midtown Office at its
 * shipped demand gives **0 of 50**. So this is the common case, not the edge.
 *
 * **Chosen: complete-case-or-nothing, per metric class.** An estimate row is reported only when
 * *every* pair has `awtIsValid` on *both* arms. Otherwise the number is replaced by the reason and
 * the counts (R3), and the surviving pairs are **not** averaged.
 *
 * The rejected alternative is the tempting one — average the pairs that held and print the reduced
 * `n`. It is rejected because it is **selection on the outcome**: the pairs that survive are the
 * passenger traces both arms coped with, the arms lose pairs at *different* rates (Secure Tower:
 * 7 of 50 under `collective`, 8 of 50 under `eta`), and the traces that fall out are exactly the
 * ones where the dispatchers differ most. The surviving subset therefore understates the
 * difference in the regime a player is trying to fix, and it does so while displaying an honest
 * `n` — which makes it worse than a blank, not better. Labelling it *"conditioned on both arms
 * holding"* does not fix the bias; it documents it.
 *
 * The other rejected alternative is suppressing the **whole batch**. § 1 measures why not: an
 * observation-based comparison is available on all 60 shipped cells and an estimate-based one on
 * 14 (**M1**). Refusing everything would leave the batch silent on exactly the Overwhelmed
 * scenarios the campaign is built around, while the observations — people carried, rides that
 * never boarded, rides over the long-wait threshold — are perfectly good facts about runs that
 * happened. R1's rule is the one that ships.
 *
 * ## R10 — no probability words, ever
 *
 * Every sentence this module emits is either **the interval, stated**, or a **frequency over
 * runs**. There is no *"likely"*, no *"probably"*, no *"95 % chance"*. The finding behind that is
 * Budescu et al.: lay readers misinterpret calibrated likelihood terms *regressively*, and the
 * misreading is not fixed by defining the term. `report.test.ts` asserts it against a word list,
 * over every sentence and note the module can produce.
 *
 * ## R13 — no estimate without its `n`
 *
 * Every sentence names the count it was computed from, in the sentence, not in a tooltip. A row
 * that has no estimate names the count it *would* have had and the count it actually has.
 *
 * ## R11 — energy is shown and never ordered
 *
 * A metric of class `axis` gets an interval and the verdict `shown`. It is never `resolved`, so
 * nothing downstream can read a winner off it, and its note carries the reason: *the arm that
 * drives least is the arm that carried fewest people*.
 */

import {
  intervalContainsZero,
  pairedDifferenceEstimate,
  type MeanEstimate,
} from '@elevator-sim/experiments/browser';

import {
  BATCH_METRICS,
  BATCH_METRIC_CLASS,
  BATCH_METRIC_PRESENTATION,
  type BatchArmResult,
  type BatchMetric,
  type BatchMetricClass,
  type BatchReplication,
  type BatchResult,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Shape
 * -------------------------------------------------------------------------- */

/**
 * What a row is entitled to say.
 *
 * - `resolved` — the paired interval on the difference excludes zero, the metric is one that may
 *   be ordered, **and the batch is inside the project's replication budget**. The only verdict
 *   from which a caller may say one arm did better.
 * - `under-budget` — the interval excludes zero and the batch is below
 *   {@link MIN_REPLICATION_BUDGET}. The interval is **drawn**; the winner is **not named**, and
 *   the reason sits where the winner would have. See {@link compareMetric}.
 * - `unresolved` — the interval contains zero, or there was no spread to form one. The two arms
 *   are **not ordered**. W3's own liveness criterion: a profile against itself lands here.
 * - `shown` — R11's class. An interval, and a refusal to rank on it.
 * - `suppressed` — an estimate row at least one of whose pairs the run itself refuses to quote.
 * - `unmeasured` — at least one pair on which the quantity was never measured. Distinct from
 *   `suppressed`, which is a refusal, and from zero, which is a measurement.
 */
export type BatchVerdict =
  | 'resolved'
  | 'under-budget'
  | 'unresolved'
  | 'shown'
  | 'suppressed'
  | 'unmeasured';

/** One metric, compared across two arms. */
export interface BatchComparisonRow {
  readonly metric: BatchMetric;
  readonly label: string;
  readonly metricClass: BatchMetricClass;
  readonly verdict: BatchVerdict;
  /** The paired-t interval on `candidate − baseline`, or `null` when the row has no number. */
  readonly estimate: MeanEstimate | null;
  /** Pairs the estimate is over. `0` when there is none. R13, as a field as well as a sentence. */
  readonly pairs: number;
  /** Pairs the batch ran. Equal to {@link pairs} on every row that carries a number. */
  readonly totalPairs: number;
  /** The reader's sentence. Carries its `n`, and contains no probability word. */
  readonly sentence: string;
  /** Why, in the same register. Never a tooltip; the mount draws it. */
  readonly note: string;
  /**
   * Which arm this row came out ahead on, or `null` when the row does not order the two.
   *
   * `null` on every verdict but `resolved`, and `null` on an `axis` row **however** the interval
   * fell — R11: *"a row of this class reports its interval and refuses to name a winner."*
   *
   * It exists because the sentence already contains this fact and a caller that needed it was
   * otherwise going to re-derive it from `estimate.upper < 0` and `lowerIsBetter`, which is a
   * second place deciding what *better* means. `campaign/judge.ts` is that caller.
   */
  readonly favours: 'candidate' | 'baseline' | null;
}

/** How one arm behaved across the batch, before any comparison. */
export interface BatchArmSummary {
  readonly armId: string;
  readonly dispatcherProfileId: string;
  /** The profile's display name — see {@link BatchArmResult.dispatcherProfileName}. */
  readonly dispatcherProfileName: string;
  readonly n: number;
  /** Replications whose own summary stands behind a mean. */
  readonly quotable: number;
  readonly saturated: number;
  readonly timedOut: number;
  /** Replications where somebody waited past the abandonment horizon. */
  readonly starved: number;
  /** Distinct refusal reasons, in first-seen order. R3: the reason is shown, never a blank. */
  readonly reasons: readonly string[];
  /** *"in 50 runs, 43 saturated"* — a frequency over runs, never a probability. */
  readonly sentence: string;
}

/**
 * The rows, counted by what they were entitled to say — **and nothing more than that.**
 *
 * ## Why this exists, and the sentence it is deliberately not
 *
 * The Compare tab produced eight metric rows and twelve goal rows with no line anywhere that
 * stitched them together, so the one question the tab exists for went unanswered after a batch a
 * reader had waited minutes for. A play-tester asked for *"a one-line verdict … plus per-row
 * wording that names the direction"*.
 *
 * Half of that is available and half of it is forbidden, and the split is the whole design:
 *
 * - A row's **direction** is already named wherever this project permits one — `compareMetric`
 *   emits `resolved` only on a paired-t interval that excludes zero at or above
 *   {@link MIN_REPLICATION_BUDGET}, and that row's own sentence ends *"the … arm is the one that
 *   came out ahead on this row"*. There was never a missing winner there.
 * - A **verdict line that names a winner whenever the numbers differ** is CLAUDE.md's named
 *   failure mode, and this project has refused its own learned-control feature three times on
 *   exactly that ground.
 *
 * So this summary **counts and routes**. It says how many measures separated the two settings and
 * *which* they were; it never says which arm, because the row does, under a gate this object does
 * not re-derive. It is strictly weaker than the rows it summarises, which is what makes it
 * incapable of asserting anything they do not.
 *
 * The other half is R3 one level up: a reader whose three headline rows came back empty was told
 * *why* three times over in identical words and told **what to do** nowhere. {@link remedy} is
 * that, and it is not the obvious sentence — see {@link remedyFor}.
 */
export interface BatchOutcomeSummary {
  /** Rows whose verdict is `resolved`: an ordering this project's own rules permit. */
  readonly resolved: readonly BatchMetric[];
  /** Rows whose interval contains zero, or which had no spread to form one. */
  readonly unresolved: readonly BatchMetric[];
  /** Rows an arm's own summary refuses to quote, or that a broken CRN audit refuses. */
  readonly suppressed: readonly BatchMetric[];
  /** Rows at least one pair never measured. */
  readonly unmeasured: readonly BatchMetric[];
  /** R11's class: an interval drawn and a ranking refused. */
  readonly shown: readonly BatchMetric[];
  /** An interval excluding zero over fewer paired runs than the project budgets for. */
  readonly underBudget: readonly BatchMetric[];
  /** The count and the routing, in one sentence. Never a winner. */
  readonly sentence: string;
  /** What to do about the rows that said nothing, or `null` when every row spoke. */
  readonly remedy: string | null;
}

export interface BatchComparison {
  readonly baselineArmId: string;
  readonly baselineProfileId: string;
  /** The baseline profile's display name — the name the rest of the product calls it by. */
  readonly baselineProfileName: string;
  readonly candidateArmId: string;
  readonly candidateProfileId: string;
  /** The candidate profile's display name. */
  readonly candidateProfileName: string;
  readonly rows: readonly BatchComparisonRow[];
  /** What the rows added up to, and what to do about the ones that said nothing. */
  readonly summary: BatchOutcomeSummary;
}

export interface BatchReport {
  readonly buildingId: string;
  readonly buildingName: string;
  readonly seed: string;
  readonly durationS: number;
  readonly replications: number;
  /** What demand this batch ran at, in words. Part of what makes the numbers reproducible. */
  readonly demandClause: string;
  /** Whether the arms saw the same passengers, in words. Always present, aligned or not. */
  readonly crnSentence: string;
  /**
   * The trace-equivalence class every arm ran in, verbatim.
   *
   * `runner/crn.ts`'s own canonical form: *"everything the passenger trace is a function of, apart
   * from the seed"* — the building, the demand template, the horizon and every demand option, with
   * the unset ones dropped exactly as `JSON.stringify` drops them, so a batch at a building's own
   * profile reads `{"building":"midtown-office","durationS":900}` and one at an overridden demand
   * carries the rate too. It is printed rather than summarised because it is the half of the
   * batch's provenance the seed does not carry: seed plus this reproduces the run somewhere else.
   */
  readonly traceKey: string;
  /** `null` when the batch is inside CLAUDE.md's 50–200 budget; a sentence when it is not. */
  readonly budgetNote: string | null;
  readonly arms: readonly BatchArmSummary[];
  readonly comparisons: readonly BatchComparison[];
}

/* -------------------------------------------------------------------------- *
 * Budget
 * -------------------------------------------------------------------------- */

/** CLAUDE.md § Statistical discipline: *"Budget 50–200 replications per configuration."* */
export const MIN_REPLICATION_BUDGET = 50;
export const MAX_REPLICATION_BUDGET = 200;

/* -------------------------------------------------------------------------- *
 * The report
 * -------------------------------------------------------------------------- */

/**
 * The whole reader-facing form of a batch.
 *
 * Pure: no clock, no RNG, no mutation of the result. Every arm after the first is compared with
 * the first, which is the baseline; with two arms that is the one comparison the viewer draws.
 */
export function batchReport(result: BatchResult): BatchReport {
  const replications = result.arms[0]?.replications.length ?? 0;
  const baseline = result.arms[0];
  const comparisons: BatchComparison[] = [];

  for (const candidate of result.arms.slice(1)) {
    if (baseline === undefined) break;
    const rows = BATCH_METRICS.map((metric) => compareMetric(metric, baseline, candidate, result));
    comparisons.push({
      baselineArmId: baseline.armId,
      baselineProfileId: baseline.dispatcherProfileId,
      baselineProfileName: baseline.dispatcherProfileName,
      candidateArmId: candidate.armId,
      candidateProfileId: candidate.dispatcherProfileId,
      candidateProfileName: candidate.dispatcherProfileName,
      rows,
      summary: summarise(rows, baseline, candidate),
    });
  }

  return {
    buildingId: result.buildingId,
    buildingName: result.buildingName,
    seed: result.seed,
    durationS: result.durationS,
    replications,
    demandClause:
      result.arrivalRatePctPop5min === null
        ? "at the building's own traffic profile"
        : `at ${String(result.arrivalRatePctPop5min)} % of population arriving per 5 minutes`,
    crnSentence: crnSentence(result),
    traceKey: result.crn.traceKey,
    budgetNote: budgetNote(replications),
    arms: result.arms.map((arm) => summariseArm(arm)),
    comparisons,
  };
}

function budgetNote(replications: number): string | null {
  if (replications >= MIN_REPLICATION_BUDGET && replications <= MAX_REPLICATION_BUDGET) return null;
  if (replications < MIN_REPLICATION_BUDGET) {
    return (
      `This batch ran ${String(replications)} replications. The project's budget is ` +
      `${String(MIN_REPLICATION_BUDGET)}–${String(MAX_REPLICATION_BUDGET)}: ten replications ` +
      'produced a 12 % error against the converged mean in the reference study, so an interval ' +
      'from fewer than 50 is wider than it looks useful.'
    );
  }
  return (
    `This batch ran ${String(replications)} replications, above the project's stated budget of ` +
    `${String(MIN_REPLICATION_BUDGET)}–${String(MAX_REPLICATION_BUDGET)}. Nothing is wrong with ` +
    'the arithmetic; it simply costs more than the project budgets for.'
  );
}

function crnSentence(result: BatchResult): string {
  const { crn } = result;
  if (crn.aligned) {
    return (
      `Common random numbers held: ${String(crn.checkedComparisons)} arm-to-arm comparisons were ` +
      'checked passenger by passenger — arrival time, origin, every leg, mass and credential — ' +
      'and the arms saw the same people every time.'
    );
  }
  const first = crn.mismatches[0];
  return (
    `Common random numbers are broken: ${String(crn.mismatches.length)} of ` +
    `${String(crn.checkedComparisons)} compared replications saw different passengers on arms ` +
    `that share one trace key. First at replication ${String(first?.replication)}, arm ` +
    `"${String(first?.armId)}" against "${String(first?.baselineArmId)}": ${String(first?.detail)}. ` +
    'No interval is computed from this batch, because a paired interval across these arms would ' +
    'be arithmetic on unrelated runs.'
  );
}

/* -------------------------------------------------------------------------- *
 * Per arm
 * -------------------------------------------------------------------------- */

function summariseArm(arm: BatchArmResult): BatchArmSummary {
  const n = arm.replications.length;
  const quotable = arm.replications.filter((rep) => rep.awtIsValid).length;
  const saturated = arm.replications.filter((rep) => rep.saturated).length;
  const timedOut = arm.replications.filter((rep) => rep.status === 'timed-out').length;
  const starved = arm.replications.filter((rep) => rep.serviceLevelVerdict === 'starved').length;
  const reasons: string[] = [];
  for (const rep of arm.replications) {
    if (rep.awtInvalidReason === null) continue;
    if (!reasons.includes(rep.awtInvalidReason)) reasons.push(rep.awtInvalidReason);
  }
  /*
   * Frequencies over runs, and the denominator is the actual count — R13 clause two's rule kept
   * by construction, because the denominator is never rounded to 20 or 100. "6 of 20" is a
   * sentence; "1 in 20 runs" over a sample of 6 is not.
   */
  const parts = [
    `${String(quotable)} of ${String(n)} runs stand behind an average wait`,
    `${String(saturated)} saturated`,
    `${String(timedOut)} ended with people still in the system`,
    `${String(starved)} left somebody past the abandonment horizon`,
  ];
  return {
    armId: arm.armId,
    dispatcherProfileId: arm.dispatcherProfileId,
    dispatcherProfileName: arm.dispatcherProfileName,
    n,
    quotable,
    saturated,
    timedOut,
    starved,
    reasons,
    /*
     * **Name and id together, here and only here.** This is the row that establishes the pairing —
     * the dispatcher rail, the status bar and the Free Play menu all say *Minimum estimated wait*
     * and the batch used to say only `eta`, so a reader had to guess which of the twelve they had
     * just run. The comparison sentences below carry the name alone: the mapping is established
     * once, and eight rows of `Name (slug)` is a mapping restated until nobody reads it.
     */
    sentence: `${named(arm)}: ${parts.join('; ')}.`,
  };
}

/** `Minimum estimated wait (eta)` — the form the building picker already uses. */
function named(arm: BatchArmResult): string {
  return arm.dispatcherProfileName === arm.dispatcherProfileId
    ? arm.dispatcherProfileId
    : `${arm.dispatcherProfileName} (${arm.dispatcherProfileId})`;
}

/* -------------------------------------------------------------------------- *
 * Per metric
 * -------------------------------------------------------------------------- */

interface Pairing {
  readonly candidate: readonly number[];
  readonly baseline: readonly number[];
  /** Pairs where either arm's own summary refuses to quote the estimate class. */
  readonly suppressedPairs: number;
  /** Pairs where either arm never measured the quantity. */
  readonly unmeasuredPairs: number;
  readonly totalPairs: number;
}

/**
 * Pair a metric across two arms, and count the two ways a pair can be unusable.
 *
 * Both counts are returned even when the values are complete, so a caller cannot report a row
 * without knowing what it excluded. Nothing is dropped from {@link Pairing.candidate} and
 * {@link Pairing.baseline} — either every pair is there, or the caller refuses the row.
 */
function pairMetric(
  metric: BatchMetric,
  baseline: BatchArmResult,
  candidate: BatchArmResult,
): Pairing {
  const gated = BATCH_METRIC_CLASS[metric] === 'estimate';
  const byIndex = new Map<number, BatchReplication>();
  for (const rep of baseline.replications) byIndex.set(rep.replication, rep);

  const candidateValues: number[] = [];
  const baselineValues: number[] = [];
  let suppressedPairs = 0;
  let unmeasuredPairs = 0;
  let totalPairs = 0;

  for (const right of candidate.replications) {
    const left = byIndex.get(right.replication);
    if (left === undefined) continue;
    totalPairs += 1;
    if (gated && !(left.awtIsValid && right.awtIsValid)) {
      suppressedPairs += 1;
      continue;
    }
    const leftValue = left.metrics[metric];
    const rightValue = right.metrics[metric];
    if (leftValue === null || rightValue === null) {
      unmeasuredPairs += 1;
      continue;
    }
    baselineValues.push(leftValue);
    candidateValues.push(rightValue);
  }

  return {
    candidate: candidateValues,
    baseline: baselineValues,
    suppressedPairs,
    unmeasuredPairs,
    totalPairs,
  };
}

function compareMetric(
  metric: BatchMetric,
  baseline: BatchArmResult,
  candidate: BatchArmResult,
  result: BatchResult,
): BatchComparisonRow {
  const presentation = BATCH_METRIC_PRESENTATION[metric];
  const metricClass = BATCH_METRIC_CLASS[metric];
  const pairing = pairMetric(metric, baseline, candidate);
  const { totalPairs } = pairing;
  const base = {
    metric,
    label: presentation.label,
    metricClass,
    totalPairs,
  } as const;

  if (!result.crn.aligned) {
    return {
      ...base,
      verdict: 'suppressed',
      estimate: null,
      pairs: 0,
      favours: null,
      sentence: `in ${runs(totalPairs)}, no ${presentation.label} comparison is made.`,
      note: crnSentence(result),
    };
  }

  if (pairing.suppressedPairs > 0) {
    const valid = totalPairs - pairing.suppressedPairs - pairing.unmeasuredPairs;
    return {
      ...base,
      verdict: 'suppressed',
      estimate: null,
      pairs: 0,
      favours: null,
      sentence:
        `in ${runs(totalPairs)}, there is no ${presentation.label} to compare: ` +
        `${String(pairing.suppressedPairs)} of ${String(totalPairs)} paired runs had at least one ` +
        'arm whose own summary refuses to quote a mean.',
      note:
        `${String(valid)} paired runs were left, and they are not averaged. Dropping the ` +
        'replications a building could not cope with keeps the passenger traces it did cope ' +
        'with; the two arms lose them at different rates, and the ones that fall out are the ' +
        'traces the dispatchers differ most on. The survivors would understate the difference in ' +
        `exactly the case worth fixing. ${suppressionReasons(baseline, candidate)}`,
    };
  }

  if (pairing.unmeasuredPairs > 0) {
    return {
      ...base,
      verdict: 'unmeasured',
      estimate: null,
      pairs: 0,
      favours: null,
      sentence:
        `in ${runs(totalPairs)}, ${String(pairing.unmeasuredPairs)} paired runs never measured ` +
        `${presentation.label}, so there is nothing to compare.`,
      note:
        'A quantity that was never measured is not a zero. The remaining pairs are not averaged, ' +
        'for the same reason a partly suppressed estimate is not: the runs that did measure it ' +
        'are not a random sample of the runs.',
    };
  }

  if (pairing.candidate.length < 2) {
    return {
      ...base,
      verdict: 'unresolved',
      estimate: null,
      pairs: pairing.candidate.length,
      favours: null,
      sentence:
        `in ${runs(totalPairs)}, ${presentation.label} is not resolved: a single replication has ` +
        'no measurable spread, so no interval can be formed.',
      note:
        'One run of a lift peak spans a range the project measures at 4.1–7.4 s on a ' +
        'configuration whose converged mean is 5.0 s. That is why the budget is 50–200.',
    };
  }

  const estimate = pairedDifferenceEstimate(pairing.candidate, pairing.baseline);
  const finite = Number.isFinite(estimate.lower) && Number.isFinite(estimate.upper);
  const n = estimate.n;
  const range = `${signed(estimate.lower, presentation.places)}${presentation.unit} to ${signed(estimate.upper, presentation.places)}${presentation.unit}`;
  const arithmetic =
    `Paired difference ${signed(estimate.mean, presentation.places)}${presentation.unit}, ` +
    `${(estimate.confidence * 100).toFixed(0)} % interval, Student-t at ` +
    `${String(estimate.degreesOfFreedom)} degrees of freedom, over ${runs(n)} that saw the same ` +
    'passengers. The interval is on the difference itself — two separate intervals are never ' +
    'compared here.';

  if (metricClass === 'axis') {
    /*
     * **The sign, in words — and the ranking still refused.**
     *
     * Reported by a play-tester against the shipped default, where this row read *"eta's drive
     * work (proxy) differed from collective's by −651.8 kJ to −155.5 kJ"* and stopped. To learn
     * that `eta` drove **less**, a reader had to notice the interval was negative and work out
     * which arm was the subject of the subtraction — so the tab explained its non-answers in
     * plain English and left its measurements as arithmetic homework.
     *
     * Stating the sign is not R11's concern and never was. R11 forbids *ordering* on this axis and
     * forbids *aggregating* it with a wait, because the arm that drives least is often the arm
     * that carried fewest people. *"Lower"* is the measurement; *"better"* is the claim. The word
     * withheld is the second one, and the sentence says so rather than leaving the refusal to a
     * note a reader may quote apart from it — § D171's shape.
     */
    const lower = estimate.upper < 0 ? candidate : baseline;
    const higher = lower === candidate ? baseline : candidate;
    const sign = Number.isFinite(estimate.lower) && Number.isFinite(estimate.upper) && !intervalContainsZero(estimate)
      ? ` Across the whole of that interval ${lower.dispatcherProfileName}'s figure is the lower and ` +
        `${higher.dispatcherProfileName}'s the higher — which is a measurement of drive work and ` +
        'not a win: this row is an axis and no arm is named ahead on it.'
      : ' That interval includes zero, so the two are not separated on this axis either — and an ' +
        'axis names no arm ahead in any case.';
    return {
      ...base,
      verdict: 'shown',
      estimate,
      pairs: n,
      // R11, structurally: an energy row cannot name a winner even when its interval excludes zero.
      favours: null,
      sentence:
        `in ${runs(n)}, ${candidate.dispatcherProfileName}'s ${presentation.label} differed from ` +
        `${baseline.dispatcherProfileName}'s by ${range}.${sign}`,
      note:
        `${arithmetic} Energy is an axis and never a score: measured across this project's own ` +
        'experiment matrix, the weakest shipped dispatcher sits on the Pareto front at six of ' +
        'eight cells because it carries fewer people. Read this row beside the waits above, ' +
        'never instead of them.',
    };
  }

  if (!finite || intervalContainsZero(estimate)) {
    return {
      ...base,
      verdict: 'unresolved',
      estimate,
      pairs: n,
      favours: null,
      sentence:
        `in ${runs(n)}, the difference in ${presentation.label} between ` +
        `${candidate.dispatcherProfileName} and ${baseline.dispatcherProfileName} was ${range}. That ` +
        `interval includes zero, so the two are not ordered at n = ${String(n)}: this batch cannot ` +
        'resolve a difference on this measure, which is not the same as the two settings being ' +
        'the same.',
      note: arithmetic,
    };
  }

  /*
   * **Below the budget: publish the observation, refuse the claim.** — § D171, and it is the
   * shape the rest of this product already has.
   *
   * `compareMetric` used to emit `resolved` and name a winner as soon as the paired interval
   * excluded zero, which needs `pairing.candidate.length >= 2` and nothing else, while
   * `dev/batchPanel.ts` refuses only `replications < 1`. The honesty search produced that row at
   * n = 7 and n = 8 on observation-class metrics — which survive at small n precisely because
   * the estimate-class rows suppress first. R2's own text requires *"a paired-t interval
   * excluding zero over 50–200 replications under common random numbers"*, and
   * {@link MIN_REPLICATION_BUDGET} is that lower bound as a shipped constant, read here rather
   * than restated.
   *
   * `budgetNote` already said so — **in a different row**, which is the deeper half of the
   * finding: a qualification a reader can quote apart from the claim it qualifies is R13 clause
   * one's defect one level up. So the reason goes **where the verdict would have been**, in the
   * row's own sentence, and the interval is still drawn: the measurement happened and is not
   * hidden, and what is withheld is the ordering it cannot support.
   */
  if (estimate.n < MIN_REPLICATION_BUDGET) {
    return {
      ...base,
      verdict: 'under-budget',
      estimate,
      pairs: n,
      // The whole point: an interval that excludes zero over too few pairs orders nothing.
      favours: null,
      sentence:
        `in ${runs(n)}, ${candidate.dispatcherProfileName}'s ${presentation.label} differed from ` +
        `${baseline.dispatcherProfileName}'s by ${range}, and no arm is named ahead on this row: ` +
        `${runs(n)} is below this project's replication budget of ` +
        `${String(MIN_REPLICATION_BUDGET)}–${String(MAX_REPLICATION_BUDGET)}, and an interval ` +
        'that excludes zero over too few paired runs is a direction this batch cannot support.',
      note:
        `${arithmetic} Ten replications produced a 12 % error against the converged mean in the ` +
        'reference study, which is why the budget is what it is. The interval above is the ' +
        'measurement and it is not withheld; the ordering is.',
    };
  }

  const candidateIsLower = estimate.upper < 0;
  const better =
    presentation.lowerIsBetter === null
      ? null
      : candidateIsLower === presentation.lowerIsBetter
        ? candidate.dispatcherProfileName
        : baseline.dispatcherProfileName;
  const direction = candidateIsLower ? 'lower' : 'higher';
  /*
   * Smallest magnitude first — **found by driving the panel**, not by a test. Taking
   * `|upper|` then `|lower|` reads correctly on a negative interval (`[−4.09, −0.71]` → *"between
   * 0.71 and 4.09"*) and **backwards** on a positive one (`[+6.40, +11.62]` → *"between 11.62 and
   * 6.40"*), which is a sentence a reader has to stop and re-parse. The bound the reader can rely
   * on goes first either way, which is the smaller one.
   */
  const magnitudes = [Math.abs(estimate.lower), Math.abs(estimate.upper)].sort((a, b) => a - b);
  const magnitude = `${format(magnitudes[0] ?? 0, presentation.places)}${presentation.unit} and ${format(magnitudes[1] ?? 0, presentation.places)}${presentation.unit}`;

  return {
    ...base,
    verdict: 'resolved',
    estimate,
    pairs: n,
    favours:
      presentation.lowerIsBetter === null
        ? null
        : candidateIsLower === presentation.lowerIsBetter
          ? 'candidate'
          : 'baseline',
    sentence:
      `in ${runs(n)}, ${candidate.dispatcherProfileName}'s ${presentation.label} was ${direction} ` +
      `than ${baseline.dispatcherProfileName}'s, by between ${magnitude}` +
      `${better === null ? '' : ` — the ${better} arm is the one that came out ahead on this row`}.`,
    note: arithmetic,
  };
}

/* -------------------------------------------------------------------------- *
 * The summary — counting the rows, and routing the reader
 * -------------------------------------------------------------------------- */

/**
 * Roll the rows up into one sentence, and name what to do about the silent ones.
 *
 * Pure projection: every fact here is read off a {@link BatchComparisonRow.verdict} that
 * {@link compareMetric} already decided under the gates it documents. Nothing is re-derived from an
 * interval, so this function cannot reach a conclusion the rows do not already carry, and it cannot
 * drift from them.
 *
 * See {@link BatchOutcomeSummary} for what it deliberately does not say.
 */
function summarise(
  rows: readonly BatchComparisonRow[],
  baseline: BatchArmResult,
  candidate: BatchArmResult,
): BatchOutcomeSummary {
  const of = (verdict: BatchVerdict): readonly BatchMetric[] =>
    rows.filter((row) => row.verdict === verdict).map((row) => row.metric);
  const resolved = of('resolved');
  const unresolved = of('unresolved');
  const suppressed = of('suppressed');
  const unmeasured = of('unmeasured');
  const shown = of('shown');
  const underBudget = of('under-budget');
  const total = rows.length;
  const pairs = rows[0]?.totalPairs ?? 0;

  const clauses: string[] = [];
  if (resolved.length > 0) {
    /*
     * **The measures, never the arms.** Each of these rows already names the arm ahead, under the
     * one gate this project permits — a paired-t interval excluding zero at or above the budget.
     * Repeating the winner here would be a second place deciding it; pointing at the row is not.
     */
    clauses.push(
      `${String(resolved.length)} separated the two — ${labels(resolved)}, and each of those rows ` +
        'names the arm ahead',
    );
  }
  if (underBudget.length > 0) {
    clauses.push(
      `${String(underBudget.length)} measured a difference over too few paired runs to order the ` +
        `two — ${labels(underBudget)}`,
    );
  }
  if (unresolved.length > 0) {
    clauses.push(
      `${String(unresolved.length)} came back with an interval containing zero, which is no ` +
        `difference this batch can resolve — ${labels(unresolved)}`,
    );
  }
  if (suppressed.length > 0) {
    clauses.push(
      `${String(suppressed.length)} could not be compared at all — ${labels(suppressed)}`,
    );
  }
  if (unmeasured.length > 0) {
    clauses.push(`${String(unmeasured.length)} were never measured — ${labels(unmeasured)}`);
  }
  if (shown.length > 0) {
    clauses.push(
      `${String(shown.length)} are energy axes, shown and never ranked — ${labels(shown)}`,
    );
  }

  return {
    resolved,
    unresolved,
    suppressed,
    unmeasured,
    shown,
    underBudget,
    sentence:
      `${candidate.dispatcherProfileName} against ${baseline.dispatcherProfileName}, over ` +
      `${runs(pairs)} on the same passengers. Of ${String(total)} measures, ${clauses.join('; ')}.`,
    remedy: remedyFor(suppressed.length > 0, unresolved.length > 0, pairs),
  };
}

/**
 * What to do about a row that said nothing — **and the obvious answer is wrong for half of them.**
 *
 * A play-tester waited out the shipped default, got three empty headline rows and the same 90-word
 * justification printed three times, and observed that *"nothing tells the player what to do"*.
 * CLAUDE.md's budget line makes *more replications* look like the answer to everything. It is the
 * answer to exactly one of the two cases, and it is actively **wrong** for the other:
 *
 * - **An interval containing zero** is a statement about the batch, not about the settings: the
 *   difference is smaller than this many paired runs can resolve. More replications narrow the
 *   interval, and 50–200 is the budget.
 * - **A suppressed row** is the complete-case rule firing — an estimate is reported only when
 *   *every* pair stands behind one. Raising the count therefore makes suppression **more** likely,
 *   not less: at the shipped Chancery House default one run in fifty saturates, so a hundred
 *   replications would be expected to lose two. The lever is the load, and the panel has it.
 *
 * What is deliberately **not** suggested is changing the seed until the batch cooperates. That is
 * choosing the outcome, and a remedy that taught it would undo everything else on this surface.
 */
function remedyFor(
  anySuppressed: boolean,
  anyUnresolved: boolean,
  pairs: number,
): string | null {
  const parts: string[] = [];
  if (anySuppressed) {
    parts.push(
      'A measure that could not be compared is the complete-case rule, not a failure: an estimate ' +
        'is reported only when every paired run stands behind one, so more replications make this ' +
        'more common rather than less. The lever is the load — lower "demand %pop/5 min" until the ' +
        'queues stop growing, or run a building that copes with its own traffic. The rows below ' +
        'are unaffected, because they are counts of what happened rather than means.',
    );
  }
  if (anyUnresolved) {
    parts.push(
      pairs < MAX_REPLICATION_BUDGET
        ? `A difference this batch cannot resolve is not a tie. Raising replications from ` +
          `${String(pairs)} toward ${String(MAX_REPLICATION_BUDGET)} narrows the interval, and ` +
          `${String(MIN_REPLICATION_BUDGET)}–${String(MAX_REPLICATION_BUDGET)} is what this ` +
          'project budgets for. What is not a remedy is running it again on a different seed until ' +
          'it separates: that chooses the answer.'
        : `A difference this batch cannot resolve is not a tie. This batch is already at the top ` +
          `of the project's ${String(MIN_REPLICATION_BUDGET)}–${String(MAX_REPLICATION_BUDGET)} ` +
          'budget, so the honest reading is that the difference is smaller than this apparatus ' +
          'resolves here — try a building or a demand level where the two settings have more to ' +
          'disagree about.',
    );
  }
  return parts.length === 0 ? null : parts.join(' ');
}

/** `average wait, 95th-percentile wait and door-to-door time` — the reader's names, listed. */
function labels(metrics: readonly BatchMetric[]): string {
  const names = metrics.map((metric) => BATCH_METRIC_PRESENTATION[metric].label);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${String(names[names.length - 1])}`;
}

/* -------------------------------------------------------------------------- *
 * Words and numbers
 * -------------------------------------------------------------------------- */

/**
 * *"50 runs"* — the natural-frequency unit § 3.4 asks for, with the real denominator.
 *
 * Never *"1 in 20"* unless a caller has at least twenty; this project's own R13 measurement is a
 * quotable AWT over **five** legs, and a one-in-twenty restatement of that names a rider the
 * sample does not contain. Nothing here rounds a denominator, so the rule is kept structurally.
 */
function runs(n: number): string {
  return `${String(n)} ${n === 1 ? 'run' : 'runs'}`;
}

function format(value: number, places: number): string {
  return value.toFixed(places);
}

function signed(value: number, places: number): string {
  const text = Math.abs(value).toFixed(places);
  return `${value < 0 ? '−' : '+'}${text}`;
}

/** The distinct refusals both arms gave, so R3's *"show the reason"* survives aggregation. */
function suppressionReasons(baseline: BatchArmResult, candidate: BatchArmResult): string {
  const reasons: string[] = [];
  for (const arm of [baseline, candidate]) {
    for (const rep of arm.replications) {
      if (rep.awtInvalidReason === null) continue;
      if (!reasons.includes(rep.awtInvalidReason)) reasons.push(rep.awtInvalidReason);
    }
  }
  const first = reasons[0];
  if (first === undefined) return '';
  /*
   * One, in full. Every shipped saturation reason embeds that run's own queue growth, so 50
   * refusals de-duplicate to 50 distinct strings — printing them all is fifteen thousand
   * characters of near-identical prose, which is a worse way of hiding a fact than a blank.
   * Found by driving the panel; the complete list is on `BatchArmSummary.reasons`.
   */
  const more =
    reasons.length > 1
      ? ` (${String(reasons.length - 1)} more refusals said the same thing about their own queues)`
      : '';
  return `One of them said: ${first}${more}`;
}
