/**
 * The published goal pass-rate table — `data/scenario-goals.json` — and the rule that a goal may
 * not ship without one.
 *
 * ## Why this file exists rather than a comment in a design document
 *
 * **R12** is a rule about what may ship, and § 11's own standing lesson is that a rule nothing
 * mechanically enforces is a rule that has already been broken ten times in this repository. So:
 *
 * - the measured rate lives in `data/`, beside the goal it belongs to, in the file a scenario
 *   carries — invariant 7's shape, and `docs/10` § 5.2's *"it is data — a JSON file, validated by
 *   a schema"*;
 * - {@link validatePublishedGoalRates} is the schema, and it refuses a table in which **any**
 *   goal kind is missing on **any** scenario. Not "every shipped goal has a rate" — *every kind
 *   is accounted for*, so an eighth kind added to {@link GOAL_KINDS} reds this on every scenario
 *   until somebody measures it;
 * - `goalRates.test.ts` runs the validator against the shipped file, and separately **re-derives**
 *   every count by re-running the batches. A published number that does not reproduce from the
 *   code that produced it is this repository's named defect, and a table of pass rates is exactly
 *   the shape it takes.
 *
 * ## The counts are published; the quotient is not
 *
 * `passes` and `n`, never `rate`. A rate is `passes / n` and a reader can do that division; a
 * *stored* rate is a number that can drift from its own counts through an edit or a rounding, and
 * CLAUDE.md records three published figures that did exactly that. Every rate in this table is
 * therefore derived at read time, and {@link validatePublishedGoalRates} additionally re-derives
 * the stored **class** from the stored counts, so a class that contradicts its own numbers is a
 * failure rather than a curiosity.
 *
 * ## R13 in the file format
 *
 * There is no way to write a rate here without its `n`: `n` is a required field of the same
 * object, and a record whose counts do not sum to it is a violation.
 */

import {
  GOAL_JUDGEMENT,
  GOAL_KINDS,
  GOAL_TAKES_THRESHOLD,
  isPerReplicationGoal,
  type GoalDisposition,
  type GoalKind,
  type GoalRateClass,
} from './goals.js';

/* -------------------------------------------------------------------------- *
 * The file shape
 * -------------------------------------------------------------------------- */

/** One seed set, as the file records it. */
export interface PublishedSeedSet {
  readonly name: string;
  readonly seed: string;
  readonly replications: number;
}

/** One goal's rate on one seed set. Counts only — see the module docstring. */
export interface PublishedRate {
  readonly n: number;
  readonly passes: number;
  readonly fails: number;
  readonly unmeasured: number;
  readonly rateClass: GoalRateClass;
}

/**
 * One goal kind on one scenario, wherever it ended up.
 *
 * The same shape in all three buckets, so nothing about which bucket a record is in can change
 * what it must carry. {@link tuning} and {@link holdout} are `null` only for a kind that has no
 * per-replication predicate at all, and then {@link reason} says which and why.
 */
export interface PublishedGoalRecord {
  readonly kind: GoalKind;
  readonly threshold: number | null;
  readonly disposition: GoalDisposition;
  readonly tuning: PublishedRate | null;
  readonly holdout: PublishedRate | null;
  /** `true` when both seed sets reached the same class. `null` when there is nothing to compare. */
  readonly holdoutAgrees: boolean | null;
  /** The reader's sentence: what this goal is on this scenario, and why. Never empty. */
  readonly reason: string;
}

export interface PublishedScenario {
  readonly id: string;
  readonly name: string;
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly durationS: number;
  readonly arrivalRatePctPop5min: number | null;
  readonly tuningSeeds: PublishedSeedSet;
  readonly holdoutSeeds: PublishedSeedSet;
  /**
   * Goals that may ship. Every one is judged over a **batch**, never on one run.
   *
   * Two ways in, and they are different facts: a per-run kind whose measured rate is `variable` on
   * **both** seed sets, and `beat-the-baseline`, which was never a one-run goal at all (R2) and so
   * has no rate to demote. The second carries `null` counts and says why.
   */
  readonly goals: readonly PublishedGoalRecord[];
  /**
   * Constants. **Not goals** — facts about the configuration, for the scenario's brief.
   *
   * R12: *"a pass rate of 0 or 1 makes it a statement about the configuration — state it in the
   * brief instead."* They are published rather than deleted because the fact is worth telling and
   * because a kind that vanished from the table would be indistinguishable from one nobody
   * measured.
   */
  readonly configurationFacts: readonly PublishedGoalRecord[];
  /** Everything that may not ship here at all, each with the reason it may not. */
  readonly withheld: readonly PublishedGoalRecord[];
}

export interface PublishedGoalRates {
  /** How to regenerate the file, so a stale number has an owner. */
  readonly generatedBy: string;
  readonly contract: string;
  readonly scenarios: readonly PublishedScenario[];
}

/* -------------------------------------------------------------------------- *
 * Re-derivation
 * -------------------------------------------------------------------------- */

/**
 * The class a set of counts implies — the same function {@link measureGoalRate} applies, stated
 * here over the *published* numbers so the file can be checked against itself.
 *
 * Deliberately **not** imported from `goals.ts`'s internals: that function classifies a live
 * measurement, this one classifies a record, and the fact that the two agree is what
 * `goalRates.test.ts` asserts. One of them being wrong is a finding; sharing one implementation
 * would make it invisible.
 */
export function classOfCounts(rate: PublishedRate): GoalRateClass | null {
  if (rate.passes + rate.fails + rate.unmeasured !== rate.n) return null;
  if (rate.n === 0 || rate.unmeasured > 0) return 'unjudgeable';
  if (rate.passes === rate.n) return 'constant-pass';
  if (rate.passes === 0) return 'constant-fail';
  return 'variable';
}

/* -------------------------------------------------------------------------- *
 * The guard
 * -------------------------------------------------------------------------- */

/** R12's floor: *"run it over at least 20 seeds on its own scenario."* */
export const MIN_SEEDS_PER_GOAL = 20;

/**
 * Every way the published table can be wrong, as a list of sentences. Empty means it is sound.
 *
 * A list rather than a throw, and a *sentence* rather than a code, because the caller is a test
 * whose failure text is the thing a future reader will actually see. `toEqual([])` prints every
 * violation at once, which is what makes a regenerated file cheap to fix.
 */
export function validatePublishedGoalRates(table: PublishedGoalRates): readonly string[] {
  const violations: string[] = [];
  const seen = new Set<string>();

  if (table.scenarios.length === 0) {
    violations.push('the table declares no scenarios, so it asserts nothing about any goal.');
  }

  for (const scenario of table.scenarios) {
    const where = `scenario "${scenario.id}"`;
    if (seen.has(scenario.id)) violations.push(`${where}: declared twice.`);
    seen.add(scenario.id);

    for (const set of [scenario.tuningSeeds, scenario.holdoutSeeds]) {
      if (set.replications < MIN_SEEDS_PER_GOAL) {
        violations.push(
          `${where}: seed set "${set.name}" runs ${String(set.replications)} replications; R12 ` +
            `requires at least ${String(MIN_SEEDS_PER_GOAL)}.`,
        );
      }
    }
    if (scenario.tuningSeeds.seed === scenario.holdoutSeeds.seed) {
      violations.push(
        `${where}: the tuning and holdout seed sets share master seed ` +
          `"${scenario.tuningSeeds.seed}", so the holdout validates nothing.`,
      );
    }

    const buckets: readonly (readonly [string, readonly PublishedGoalRecord[]])[] = [
      ['goals', scenario.goals],
      ['configurationFacts', scenario.configurationFacts],
      ['withheld', scenario.withheld],
    ];

    const kindsSeen = new Map<GoalKind, string>();
    for (const [bucket, records] of buckets) {
      for (const record of records) {
        const already = kindsSeen.get(record.kind);
        if (already !== undefined) {
          violations.push(
            `${where}: "${record.kind}" appears in both "${already}" and "${bucket}". A goal has ` +
              'one disposition.',
          );
        }
        kindsSeen.set(record.kind, bucket);
        violations.push(...checkRecord(where, bucket, record, scenario));
      }
    }

    /*
     * The clause that makes this a guard rather than a report: **every** kind must be accounted
     * for. A goal that ships without a measured rate is, mechanically, a kind that is in no
     * bucket — which is exactly what happens when somebody adds a kind and forgets to measure it.
     */
    for (const kind of GOAL_KINDS) {
      if (!kindsSeen.has(kind)) {
        violations.push(
          `${where}: goal kind "${kind}" has no measured pass rate here and is in no bucket. ` +
            'R12: a goal ships with its across-seed rate published beside it, or it does not ' +
            'ship. If it cannot be measured, it belongs in "withheld" with the reason.',
        );
      }
    }
  }

  return violations;
}

function checkRecord(
  where: string,
  bucket: string,
  record: PublishedGoalRecord,
  scenario: PublishedScenario,
): readonly string[] {
  const violations: string[] = [];
  const at = `${where}, ${bucket}."${record.kind}"`;

  if (!GOAL_KINDS.includes(record.kind)) {
    violations.push(`${at}: not a goal kind this build knows.`);
    return violations;
  }
  if (record.reason.trim() === '') {
    violations.push(`${at}: carries no reason. R3's shape — the refusal replaces the number.`);
  }
  const wantsThreshold = GOAL_TAKES_THRESHOLD[record.kind];
  if (wantsThreshold && record.threshold === null) {
    violations.push(`${at}: takes a threshold and declares none, so its rate means nothing.`);
  }
  if (!wantsThreshold && record.threshold !== null) {
    violations.push(`${at}: declares a threshold it does not take.`);
  }

  const measurable = isPerReplicationGoal(record.kind);
  if (!measurable) {
    /*
     * A kind with no per-run predicate is **not** automatically unshippable, and getting that
     * wrong was this lane's own first draft. R12 governs goals judged on *one run*.
     * `beat-the-baseline` never was one — § 5.2 already ships it as a batch goal because R2 says
     * a comparison needs a batch — so it ships, with no counts and nothing to demote. What is
     * unshippable is the kind the recording cannot answer **at all**.
     */
    const judgement = GOAL_JUDGEMENT[record.kind];
    const wanted = judgement === 'batch-only' ? 'goals' : 'withheld';
    const wantedDisposition: GoalDisposition = judgement === 'batch-only' ? 'batch' : 'not-shippable';
    if (bucket !== wanted) {
      violations.push(
        `${at}: has no per-replication predicate and is "${judgement}", so it belongs in ` +
          `"${wanted}" and is in "${bucket}".`,
      );
    }
    if (record.disposition !== wantedDisposition) {
      violations.push(
        `${at}: is "${judgement}" and declares disposition "${record.disposition}"; it is ` +
          `"${wantedDisposition}".`,
      );
    }
    if (record.tuning !== null || record.holdout !== null) {
      violations.push(`${at}: carries counts for a kind that cannot be judged on one run.`);
    }
    return violations;
  }

  if (record.tuning === null || record.holdout === null) {
    violations.push(
      `${at}: is measurable on one run and carries no counts. R12 requires the rate published ` +
        'beside the goal, on both seed sets.',
    );
    return violations;
  }

  const pairs: readonly (readonly [string, PublishedRate, PublishedSeedSet])[] = [
    ['tuning', record.tuning, scenario.tuningSeeds],
    ['holdout', record.holdout, scenario.holdoutSeeds],
  ];
  for (const [name, rate, seeds] of pairs) {
    const derived = classOfCounts(rate);
    if (derived === null) {
      violations.push(
        `${at}: the ${name} counts do not add up — ${String(rate.passes)} + ` +
          `${String(rate.fails)} + ${String(rate.unmeasured)} is not ${String(rate.n)}.`,
      );
      continue;
    }
    if (derived !== rate.rateClass) {
      violations.push(
        `${at}: the ${name} class is published as "${rate.rateClass}" and its own counts say ` +
          `"${derived}".`,
      );
    }
    if (rate.n !== seeds.replications) {
      violations.push(
        `${at}: the ${name} rate is over ${String(rate.n)} runs and the seed set declares ` +
          `${String(seeds.replications)}.`,
      );
    }
  }

  const agrees = record.tuning.rateClass === record.holdout.rateClass;
  if (record.holdoutAgrees !== agrees) {
    violations.push(
      `${at}: says holdoutAgrees is ${String(record.holdoutAgrees)} and the two published ` +
        'classes say otherwise.',
    );
  }

  const expected: GoalDisposition = !agrees
    ? 'not-shippable'
    : record.tuning.rateClass === 'variable'
      ? 'batch'
      : record.tuning.rateClass === 'unjudgeable'
        ? 'not-shippable'
        : 'configuration-fact';
  if (record.disposition !== expected) {
    violations.push(
      `${at}: disposition "${record.disposition}" does not follow from its own rates; R12 makes ` +
        `it "${expected}".`,
    );
  }

  const wantedBucket =
    expected === 'batch' ? 'goals' : expected === 'configuration-fact' ? 'configurationFacts' : 'withheld';
  if (bucket !== wantedBucket) {
    violations.push(
      `${at}: is in "${bucket}" and its measured rate puts it in "${wantedBucket}". ` +
        (wantedBucket === 'configurationFacts'
          ? 'A constant is not a goal — it is a fact about the configuration and belongs in the brief.'
          : wantedBucket === 'goals'
            ? 'R12: anything strictly between 0 and 1 is a batch goal.'
            : 'It cannot be judged consistently here, so it may not ship here.'),
    );
  }

  return violations;
}
