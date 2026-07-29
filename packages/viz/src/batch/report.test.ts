/**
 * The report's four rules, asserted rather than assumed —
 * `docs/10-experience-layer-contract.md` § 1 **R1**, **R3**, **R10**, **R11**, **R13**.
 *
 * The suppression rule is the one worth reading. A test that only checked *"a suppressed row has
 * no estimate"* would pass on an implementation that averaged the survivors and then forgot to
 * attach the object, so the assertion below is sharper: the suppressed row's text must not contain
 * the number a survivor average would have produced, and that number is computed here, in the
 * test, from the same fixture.
 */

import { isReplicationMetric } from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import { batchReport, type BatchComparisonRow, type BatchReport } from './report.js';
import { fakeResult } from './fixtures.test-helper.js';
import {
  BATCH_METRICS,
  BATCH_METRIC_CLASS,
  BATCH_METRIC_PRESENTATION,
  type BatchMetricIsAReplicationMetric,
} from './types.js';

/* The compile-time claim in `types.ts`, given a value so it cannot rot unnoticed. */
const everyBatchMetricIsAReplicationMetric: BatchMetricIsAReplicationMetric = true;

/**
 * The words **R10** forbids.
 *
 * The IPCC's calibrated-language framework is the largest deployed attempt to turn uncertainty
 * into words, and Budescu et al. measured the outcome: readers pull "very likely" down and
 * "unlikely" up toward 50 %, correlated with their prior beliefs, and defining the term more
 * carefully does not fix it. So this surface uses the interval or a frequency over runs, and never
 * a likelihood word.
 */
const PROBABILITY_WORDS =
  /\b(?:likely|unlikely|probabl\w*|probability|chances?|odds|certainly|certain|maybe|perhaps|presumably|plausibl\w*|good bet|fifty-fifty)\b/i;

function everyString(report: BatchReport): readonly string[] {
  const out: string[] = [report.crnSentence, report.demandClause];
  if (report.budgetNote !== null) out.push(report.budgetNote);
  for (const arm of report.arms) out.push(arm.sentence, ...arm.reasons);
  for (const comparison of report.comparisons) {
    for (const row of comparison.rows) out.push(row.sentence, row.note);
  }
  return out;
}

function rowFor(report: BatchReport, metric: string): BatchComparisonRow {
  const row = report.comparisons[0]?.rows.find((candidate) => candidate.metric === metric);
  if (row === undefined) throw new Error(`no row for ${metric}`);
  return row;
}

describe('the metric table is total and is tied to the shipped projection', () => {
  it('names only metrics the shipped projection has', () => {
    /*
     * The runtime half of the claim `types.ts` makes. A type alias cannot fail at run time, and
     * `REPLICATION_METRICS` is the list that can move — it is `runner/metrics.ts`'s, and it is
     * *"the single place that says which scalar 'the AWT' is"*. So the ids are checked through the
     * shipped predicate rather than against a copy of the list.
     */
    expect(everyBatchMetricIsAReplicationMetric).toBe(true);
    expect(BATCH_METRICS.length).toBeGreaterThan(0);
    for (const metric of BATCH_METRICS) {
      expect(isReplicationMetric(metric), metric).toBe(true);
    }
    expect(isReplicationMetric('not-a-metric')).toBe(false);
  });

  it('gives every metric a class and a presentation', () => {
    for (const metric of BATCH_METRICS) {
      expect(BATCH_METRIC_CLASS[metric], metric).toBeDefined();
      expect(BATCH_METRIC_PRESENTATION[metric].label, metric).not.toBe('');
    }
    // Every metric of class `axis` refuses a direction, and no other class does. R11 is a property
    // of the table rather than of a branch in the renderer.
    for (const metric of BATCH_METRICS) {
      const axis = BATCH_METRIC_CLASS[metric] === 'axis';
      expect(BATCH_METRIC_PRESENTATION[metric].lowerIsBetter === null, metric).toBe(axis);
    }
  });
});

describe('R10 — no probability word reaches the reader', () => {
  it('holds across every verdict this module can produce', () => {
    const reports = [
      batchReport(fakeResult({ delta: -3 })), // resolved
      batchReport(fakeResult({ delta: 0 })), // unresolved, an exact tie
      batchReport(fakeResult({ delta: -3, invalidOn: [4, 9] })), // suppressed
      batchReport(fakeResult({ delta: -3, nullMetricOn: [1] })), // unmeasured
      batchReport(fakeResult({ delta: -3, aligned: false })), // CRN broken
      batchReport(fakeResult({ delta: -3, replications: 1 })), // no spread
      batchReport(fakeResult({ delta: -3, replications: 300 })), // over budget
      batchReport(fakeResult({ delta: -3, replications: 8 })), // under budget
    ];
    const verdicts = new Set(
      reports.flatMap((report) => report.comparisons[0]?.rows.map((row) => row.verdict) ?? []),
    );
    // The word list is only worth anything if it was applied to every branch.
    expect([...verdicts].sort()).toEqual([
      'resolved',
      'shown',
      'suppressed',
      'under-budget',
      'unmeasured',
      'unresolved',
    ]);
    for (const report of reports) {
      for (const text of everyString(report)) {
        expect(PROBABILITY_WORDS.test(text), text).toBe(false);
      }
    }
  });

  it('positive control: the word list catches the sentences this rule exists to forbid', () => {
    for (const banned of [
      'eta is probably a bit better',
      'the new setting is very likely faster',
      'there is a 95 % chance the difference is real',
      'it is unlikely to matter',
    ]) {
      expect(PROBABILITY_WORDS.test(banned), banned).toBe(true);
    }
  });
});

describe('R13 — no estimate without the count it came from', () => {
  it('names the count in the sentence of every row that carries a number', () => {
    const report = batchReport(fakeResult({ delta: -3 }));
    for (const row of report.comparisons[0]?.rows ?? []) {
      expect(row.estimate, row.metric).not.toBeNull();
      expect(row.pairs, row.metric).toBe(row.estimate?.n);
      // In the sentence itself, not in the note and not in a tooltip. `n = 5` is not a caveat on
      // `11.3 s`; it is part of what `11.3 s` means.
      expect(row.sentence, row.metric).toContain(`${String(row.pairs)} runs`);
    }
  });

  it('names the count on a row that has no number, too', () => {
    const report = batchReport(fakeResult({ delta: -3, invalidOn: [0] }));
    const awt = rowFor(report, 'awtS');
    expect(awt.estimate).toBeNull();
    expect(awt.pairs).toBe(0);
    expect(awt.sentence).toContain('50 runs');
    expect(awt.sentence).toContain('1 of 50');
  });

  it('never invents a denominator: the frequency unit is the real count', () => {
    const report = batchReport(fakeResult({ delta: -3, replications: 5 }));
    for (const text of everyString(report)) {
      // "1 in 20" over a sample of five names a run the batch does not contain. Nothing in this
      // module rounds a denominator, so no `n in m` form may appear whose `m` exceeds the batch.
      expect(/\b1 in (?:20|100|1 ?000)\b/.test(text), text).toBe(false);
    }
    for (const arm of report.arms) expect(arm.sentence).toContain('of 5 runs');
  });
});

describe('the suppression rule — complete case or nothing', () => {
  it('suppresses an estimate row when a single pair is invalid, and reports the count', () => {
    const report = batchReport(fakeResult({ delta: -3, invalidOn: [17] }));
    const awt = rowFor(report, 'awtS');
    expect(awt.verdict).toBe('suppressed');
    expect(awt.estimate).toBeNull();
    expect(awt.sentence).toContain('1 of 50 paired runs');
    expect(awt.note).toContain('not averaged');
    // R3: the reason is shown, not replaced by a blank.
    expect(awt.note).toContain('the queues never stopped growing');
  });

  it('does not print the survivor average anywhere on the suppressed row', () => {
    // The assertion that distinguishes "suppressed" from "computed and then hidden". The fixture's
    // delta is exact, so the survivor average is exactly −3.00 and would be unmistakable in text.
    const report = batchReport(fakeResult({ delta: -3, invalidOn: [17] }));
    const awt = rowFor(report, 'awtS');
    expect(`${awt.sentence} ${awt.note}`).not.toMatch(/3\.00/);
    expect(`${awt.sentence} ${awt.note}`).not.toMatch(/\bn = 49\b/);
  });

  it('leaves the observations alone — R1: the honest rule is the only one that ships', () => {
    const report = batchReport(fakeResult({ delta: -3, invalidOn: [17] }));
    for (const row of report.comparisons[0]?.rows ?? []) {
      const gated = BATCH_METRIC_CLASS[row.metric] === 'estimate';
      expect(row.verdict === 'suppressed', row.metric).toBe(gated);
      if (!gated) expect(row.pairs, row.metric).toBe(50);
    }
  });

  it('treats an unmeasured quantity as its own state, never as a zero', () => {
    const report = batchReport(fakeResult({ delta: -3, nullMetricOn: [2], nullMetric: 'energyKJ' }));
    const energy = rowFor(report, 'energyKJ');
    expect(energy.verdict).toBe('unmeasured');
    expect(energy.estimate).toBeNull();
    expect(energy.note).toContain('never measured is not a zero');
    // …and the metric beside it, which was measured, still reports.
    expect(rowFor(report, 'awtS').verdict).toBe('resolved');
  });
});

describe('the verdicts', () => {
  it('resolves when the paired interval excludes zero, and names the direction', () => {
    const report = batchReport(fakeResult({ delta: -3 }));
    const awt = rowFor(report, 'awtS');
    expect(awt.verdict).toBe('resolved');
    expect(awt.estimate?.method).toBe('t');
    expect(awt.estimate?.upper).toBeLessThan(0);
    expect(awt.sentence).toContain('lower');
    expect(awt.sentence).toContain('eta');
    expect(awt.note).toContain('The interval is on the difference itself');
  });

  it('states the magnitude range smallest-first in both directions', () => {
    /*
     * Found by driving the panel. `|upper|` then `|lower|` reads correctly on a negative interval
     * and backwards on a positive one, so a row where the candidate is *worse* printed *"by
     * between 11.62 s and 6.40 s"*. Both signs are asserted here, because fixing one direction by
     * swapping the pair would simply move the defect.
     */
    for (const delta of [-3, 3]) {
      const row = rowFor(batchReport(fakeResult({ delta, spread: 0.5 })), 'awtS');
      expect(row.verdict, String(delta)).toBe('resolved');
      const bounds = /between ([\d.]+) s and ([\d.]+) s/.exec(row.sentence);
      expect(bounds, row.sentence).not.toBeNull();
      expect(Number(bounds?.[1]), row.sentence).toBeLessThan(Number(bounds?.[2]));
    }
  });

  it('W3 liveness: a profile against itself is not resolved, and no winner is named', () => {
    // The stated liveness evidence for W3 — "a comparison whose true difference is zero reports
    // 'not resolved' rather than a winner". Here the two arms are bit-identical.
    const report = batchReport(fakeResult({ delta: 0 }));
    for (const row of report.comparisons[0]?.rows ?? []) {
      expect(['unresolved', 'shown'], row.metric).toContain(row.verdict);
      expect(row.verdict, row.metric).not.toBe('resolved');
    }
    const awt = rowFor(report, 'awtS');
    expect(awt.estimate?.mean).toBe(0);
    expect(awt.sentence).toContain('includes zero');
    expect(awt.sentence).toContain('not ordered');
  });

  it('R11: an energy row is shown and never ordered, whatever its interval says', () => {
    const report = batchReport(fakeResult({ delta: -3 }));
    for (const metric of ['energyKJ', 'energyPerServedLegKJ'] as const) {
      const row = rowFor(report, metric);
      expect(row.verdict, metric).toBe('shown');
      // The interval genuinely excludes zero here — so `shown` is a refusal to rank, not an
      // accident of the arithmetic.
      expect(row.estimate?.upper, metric).toBeLessThan(0);
      expect(row.sentence, metric).not.toContain('came out ahead');
      expect(row.note, metric).toContain('never a score');
    }
  });

  it('refuses an interval on every row when common random numbers are broken', () => {
    const report = batchReport(fakeResult({ delta: -3, aligned: false }));
    for (const row of report.comparisons[0]?.rows ?? []) {
      expect(row.verdict, row.metric).toBe('suppressed');
      expect(row.estimate, row.metric).toBeNull();
      expect(row.note, row.metric).toContain('arithmetic on unrelated runs');
    }
    expect(report.crnSentence).toContain('passengers[7]');
  });

  it('R2: below the budget it draws the interval and refuses to name a winner', () => {
    /*
     * § D171. The row used to resolve as soon as the interval excluded zero, which needs two
     * pairs; R2 requires 50–200. The fix is not silence — the measurement happened — it is the
     * observation published and the claim refused, with **the reason where the verdict would
     * have been** rather than in a separate budget row a reader can quote apart from the claim.
     */
    const report = batchReport(fakeResult({ delta: -3, replications: 8 }));
    const awt = rowFor(report, 'awtS');
    expect(awt.verdict).toBe('under-budget');
    expect(awt.favours).toBeNull();
    // The interval is drawn, not withheld.
    expect(awt.estimate?.upper).toBeLessThan(0);
    expect(awt.pairs).toBe(8);
    expect(awt.sentence).toContain('differed from');
    // …and the refusal, with its reason, is in the row's own sentence.
    expect(awt.sentence).toContain('no arm is named ahead');
    expect(awt.sentence).toContain('50–200');
    expect(awt.sentence).not.toContain('came out ahead');
    expect(awt.sentence).not.toMatch(/\b(?:lower|higher) than\b/);
    // The separate note still exists and is no longer the only place the reader is told.
    expect(report.budgetNote).toContain('12 %');
    // At the budget the row resolves exactly as before.
    const atBudget = rowFor(batchReport(fakeResult({ delta: -3, replications: 50 })), 'awtS');
    expect(atBudget.verdict).toBe('resolved');
    expect(atBudget.favours).toBe('candidate');
  });

  it('forms no interval from one replication', () => {
    const report = batchReport(fakeResult({ delta: -3, replications: 1 }));
    const awt = rowFor(report, 'awtS');
    expect(awt.verdict).toBe('unresolved');
    expect(awt.estimate).toBeNull();
    expect(awt.sentence).toContain('no measurable spread');
  });
});

describe('the replication budget is stated rather than enforced', () => {
  it('says nothing at 50 and says something below it', () => {
    expect(batchReport(fakeResult({ replications: 50 })).budgetNote).toBeNull();
    expect(batchReport(fakeResult({ replications: 200 })).budgetNote).toBeNull();
    expect(batchReport(fakeResult({ replications: 10 })).budgetNote).toContain('12 %');
    expect(batchReport(fakeResult({ replications: 300 })).budgetNote).toContain('above');
  });
});

describe('per-arm reporting', () => {
  it('counts what each arm did as a frequency over runs', () => {
    const report = batchReport(fakeResult({ invalidOn: [1, 2, 3] }));
    const baseline = report.arms[0];
    expect(baseline?.n).toBe(50);
    expect(baseline?.quotable).toBe(47);
    expect(baseline?.sentence).toContain('47 of 50 runs');
    expect(baseline?.reasons).toEqual(['the queues never stopped growing.']);
  });
});
