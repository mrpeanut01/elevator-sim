/**
 * The goal predicates and R12's classification, on hand-built replications.
 *
 * Hand-built on purpose, and the division of labour is the one `batch/report.test.ts` states:
 * `goalRates.test.ts` runs the real buildings, because *"what a goal's pass rate is on Secure
 * Tower"* is a claim about `data/`; this file proves the classification behaves the same way
 * whatever produced the numbers, **including on shapes real data does not conveniently offer** —
 * an exact 0, an exact n, and a single unjudgeable seed among forty-nine good ones.
 */

import { describe, expect, it } from 'vitest';

import {
  DISPOSITION_OF,
  GOAL_JUDGEMENT,
  GOAL_KINDS,
  GOAL_TAKES_THRESHOLD,
  goalLabel,
  isPerReplicationGoal,
  judgeReplication,
  measureGoalRate,
  type GoalSpec,
} from './goals.js';
import { fakeReplication } from '../batch/fixtures.test-helper.js';
import type { BatchReplication } from '../batch/types.js';

/** The same word list `batch/report.test.ts` bans, for the same reason (Budescu et al., R10). */
const PROBABILITY_WORDS =
  /\b(?:likely|unlikely|probabl\w*|probability|chances?|odds|certainly|certain|maybe|perhaps|presumably|plausibl\w*|good bet|fifty-fifty)\b/i;

const DELIVER: GoalSpec = { kind: 'deliver-everyone', threshold: null };
const DIVERGE: GoalSpec = { kind: 'no-divergence', threshold: null };
const ABANDON: GoalSpec = { kind: 'nobody-abandoned', threshold: null };
const DEMAND: GoalSpec = { kind: 'answer-the-demand', threshold: null };
const LONG_WAITS: GoalSpec = { kind: 'long-waits-under', threshold: 10 };

function replication(
  index: number,
  overrides: Parameters<typeof fakeReplication>[2] = {},
): BatchReplication {
  return fakeReplication(index, 1, overrides);
}

describe('judging one replication', () => {
  it('delivers everyone only when no arrival in the window went unserved', () => {
    expect(
      judgeReplication(DELIVER, replication(0, { metrics: { unservedFraction: 0 } })),
    ).toBe('pass');
    expect(
      judgeReplication(DELIVER, replication(0, { metrics: { unservedFraction: 0.0001 } })),
    ).toBe('fail');
  });

  it('reads saturation off the run’s own flag rather than re-deriving it — R9', () => {
    expect(judgeReplication(DIVERGE, replication(0, { saturated: false }))).toBe('pass');
    expect(judgeReplication(DIVERGE, replication(0, { saturated: true }))).toBe('fail');
  });

  it('fails "nobody abandoned" on the starved verdict and on nothing else', () => {
    expect(judgeReplication(ABANDON, replication(0, { serviceLevelVerdict: 'starved' }))).toBe(
      'fail',
    );
    expect(judgeReplication(ABANDON, replication(0, { serviceLevelVerdict: 'served' }))).toBe(
      'pass',
    );
  });

  it('answers the demand when at least as many were carried as arrived', () => {
    const carriedMore = replication(0, {
      metrics: { personsPer5Min: 62 },
      offeredPer5Min: 41,
    });
    const carriedFewer = replication(0, {
      metrics: { personsPer5Min: 41 },
      offeredPer5Min: 62,
    });
    const exactly = replication(0, { metrics: { personsPer5Min: 41 }, offeredPer5Min: 41 });
    expect(judgeReplication(DEMAND, carriedMore)).toBe('pass');
    expect(judgeReplication(DEMAND, carriedFewer)).toBe('fail');
    expect(judgeReplication(DEMAND, exactly)).toBe('pass');
  });

  it('is unmeasured — never a fail — when the quantity was never measured', () => {
    /*
     * § D158 found this on real data: `pctOverLongWait` is a percentage of the rides served in
     * the reporting window, and on Garden Apartments some seeds serve none. Scoring that as a
     * loss would fail a run that did nothing wrong.
     */
    expect(
      judgeReplication(LONG_WAITS, replication(0, { metrics: { pctOverLongWait: null } })),
    ).toBe('unmeasured');
    expect(
      judgeReplication(DELIVER, replication(0, { metrics: { unservedFraction: null } })),
    ).toBe('unmeasured');
    expect(judgeReplication(DEMAND, replication(0, { offeredPer5Min: null }))).toBe('unmeasured');
  });

  it('compares the long-wait percentage against the scenario’s own threshold', () => {
    expect(judgeReplication(LONG_WAITS, replication(0, { metrics: { pctOverLongWait: 10 } }))).toBe(
      'pass',
    );
    expect(
      judgeReplication(LONG_WAITS, replication(0, { metrics: { pctOverLongWait: 10.1 } })),
    ).toBe('fail');
  });

  it('refuses a kind that no single run can answer, and says which', () => {
    expect(() =>
      judgeReplication({ kind: 'everyone-can-get-there', threshold: null }, replication(0)),
    ).toThrow(/credential/i);
    expect(() =>
      judgeReplication({ kind: 'beat-the-baseline', threshold: null }, replication(0)),
    ).toThrow(/two arms/i);
  });

  it('refuses a thresholded goal with no threshold rather than inventing one', () => {
    expect(() =>
      judgeReplication({ kind: 'long-waits-under', threshold: null }, replication(0)),
    ).toThrow(/needs a threshold/);
  });
});

describe('R12’s classification', () => {
  const passing = (n: number): BatchReplication[] =>
    Array.from({ length: n }, (_, i) => replication(i, { saturated: false }));

  it('calls an all-pass rate a fact about the configuration, not a goal', () => {
    const rate = measureGoalRate(DIVERGE, passing(20));
    expect(rate.rateClass).toBe('constant-pass');
    expect(rate.disposition).toBe('configuration-fact');
    expect(rate.rate).toBe(1);
    expect(rate.sentence).toContain('20 of 20');
    expect(rate.sentence).toContain('not a goal');
  });

  it('calls an all-fail rate the same thing from the other side', () => {
    const rate = measureGoalRate(
      DIVERGE,
      Array.from({ length: 20 }, (_, i) => replication(i, { saturated: true })),
    );
    expect(rate.rateClass).toBe('constant-fail');
    expect(rate.disposition).toBe('configuration-fact');
    expect(rate.sentence).toContain('0 of 20');
  });

  it('makes anything strictly between a batch goal', () => {
    const mixed = Array.from({ length: 20 }, (_, i) => replication(i, { saturated: i % 2 === 0 }));
    const rate = measureGoalRate(DIVERGE, mixed);
    expect(rate.rateClass).toBe('variable');
    expect(rate.disposition).toBe('batch');
    expect(rate.passes).toBe(10);
    expect(rate.sentence).toContain('one run of this configuration decides nothing');
  });

  it('does not compute a rate over the seeds it could judge — one hole poisons the batch', () => {
    /*
     * **The decision, asserted rather than described.** 49 passes, 1 unmeasured. Counting the
     * survivors would report 49 of 49 — a *constant* — and would do it while displaying an honest
     * denominator, which is § D158's stated reason for refusing the same move on a partly
     * suppressed estimate: the runs that fall out are the hard ones.
     */
    const replications = [
      ...Array.from({ length: 49 }, (_, i) =>
        replication(i, { metrics: { pctOverLongWait: 1 } }),
      ),
      replication(49, { metrics: { pctOverLongWait: null } }),
    ];
    const rate = measureGoalRate(LONG_WAITS, replications);
    expect(rate.passes).toBe(49);
    expect(rate.unmeasured).toBe(1);
    expect(rate.n).toBe(50);
    expect(rate.rateClass).toBe('unjudgeable');
    expect(rate.rate).toBeNull();
    expect(rate.disposition).toBe('not-shippable');
    expect(rate.sentence).toContain('1 of 50');
    expect(rate.sentence).toContain('the ones that fall out are the hard ones');
  });

  it('has no rate at all over no replications', () => {
    const rate = measureGoalRate(DIVERGE, []);
    expect(rate.rate).toBeNull();
    expect(rate.rateClass).toBe('unjudgeable');
  });

  it('leaves no room for a single-run goal — R12’s trichotomy is exhaustive', () => {
    /*
     * Stated as a test because it is the lane's most consequential finding and the easiest thing
     * to reintroduce by accident: `DISPOSITION_OF` is total over every class, and none of its
     * values is a single-run one.
     */
    expect(new Set(Object.values(DISPOSITION_OF))).toEqual(
      new Set(['batch', 'configuration-fact', 'not-shippable']),
    );
  });
});

describe('the sentences a reader gets', () => {
  it('carry the count they were computed from — R13', () => {
    for (const n of [1, 5, 20, 50]) {
      const rate = measureGoalRate(
        DIVERGE,
        Array.from({ length: n }, (_, i) => replication(i, { saturated: i === 0 })),
      );
      expect(rate.sentence).toContain(`of ${String(n)}`);
    }
  });

  it('contain no probability word — R10', () => {
    const shapes: readonly BatchReplication[][] = [
      Array.from({ length: 20 }, (_, i) => replication(i, { saturated: false })),
      Array.from({ length: 20 }, (_, i) => replication(i, { saturated: true })),
      Array.from({ length: 20 }, (_, i) => replication(i, { saturated: i < 7 })),
      [replication(0, { metrics: { pctOverLongWait: null } })],
      [],
    ];
    for (const spec of [DIVERGE, LONG_WAITS]) {
      for (const shape of shapes) {
        const { sentence } = measureGoalRate(spec, shape);
        expect(PROBABILITY_WORDS.test(sentence), sentence).toBe(false);
      }
    }
  });

  it('negative control: the word list really does catch the sentence R10 forbids', () => {
    expect(PROBABILITY_WORDS.test('this goal is likely to pass')).toBe(true);
  });

  it('name the threshold when the goal has one, because the rate is a function of it', () => {
    expect(goalLabel(LONG_WAITS)).toBe('long-waits-under (≤ 10 %)');
    expect(goalLabel(DIVERGE)).toBe('no-divergence');
  });
});

describe('the catalogue is total', () => {
  it('gives every kind a judgement, a threshold answer and a blocker answer', () => {
    for (const kind of GOAL_KINDS) {
      expect(GOAL_JUDGEMENT[kind]).toBeDefined();
      expect(typeof GOAL_TAKES_THRESHOLD[kind]).toBe('boolean');
    }
  });

  it('agrees with itself about which kinds are per-replication', () => {
    for (const kind of GOAL_KINDS) {
      expect(isPerReplicationGoal(kind)).toBe(GOAL_JUDGEMENT[kind] === 'per-replication');
    }
  });
});
