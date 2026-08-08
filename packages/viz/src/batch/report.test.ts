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
import { fakeArm, fakeReplication, fakeResult } from './fixtures.test-helper.js';
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
    out.push(comparison.summary.sentence, comparison.summary.answer);
    if (comparison.summary.remedy !== null) out.push(comparison.summary.remedy);
    // Issue #119's three new sentences go through the same word list as everything else. A field
    // added to the summary and not added here is a sentence the R10 sweep stops seeing.
    if (comparison.summary.droppedSentence !== null) out.push(comparison.summary.droppedSentence);
    if (comparison.summary.capacityFinding !== null) out.push(comparison.summary.capacityFinding);
    for (const row of comparison.rows) out.push(row.sentence, row.note);
  }
  return out;
}

function summaryOf(report: BatchReport) {
  const summary = report.comparisons[0]?.summary;
  if (summary === undefined) throw new Error('no comparison');
  return summary;
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
    // The **name**, not the slug — see `the arms are named the way the rest of the product names
    // them` below for why this changed.
    expect(awt.sentence).toContain('Minimum estimated wait');
    expect(awt.sentence).toContain('came out ahead');
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

  it('R11: the axis row states which figure is lower, and refuses the ranking in the same breath', () => {
    /*
     * Reported by a play-tester: *"To learn that `eta` used less energy, you must notice the
     * interval is negative and work out which arm is the subject of the subtraction."* Stating the
     * sign is a measurement and R11 does not forbid it — what R11 forbids is calling the lower
     * figure the better one, because the arm that drives least is often the arm that carried
     * fewest people. Both halves are asserted, because fixing the first by dropping the second is
     * the change this test exists to fail on.
     */
    for (const metric of ['energyKJ', 'energyPerServedLegKJ'] as const) {
      const row = rowFor(batchReport(fakeResult({ delta: -3 })), metric);
      expect(row.sentence, metric).toContain("Minimum estimated wait's figure is the lower");
      expect(row.sentence, metric).toContain('not a win');
      expect(row.sentence, metric).toContain('no arm is named ahead on it');
      expect(row.favours, metric).toBeNull();
    }
  });

  it('R11: an axis row whose interval contains zero says that instead of inventing a direction', () => {
    for (const metric of ['energyKJ', 'energyPerServedLegKJ'] as const) {
      const row = rowFor(batchReport(fakeResult({ delta: 0 })), metric);
      expect(row.sentence, metric).toContain('includes zero');
      expect(row.sentence, metric).not.toContain('is the lower');
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

describe('the arms are named the way the rest of the product names them', () => {
  /*
   * A play-tester could not find the dispatcher they were running in either picker: Compare and
   * Lab listed `eta`, `collective`, `zoned-uppeak` — slugs that appear on no other screen — while
   * the rail beside them said *Minimum estimated wait* and *Conventional collective*. The results
   * prose then inherited the slugs, so even a reader who guessed right at setup had to hold the
   * mapping in their head for eight rows.
   *
   * The name is `data/dispatcher-profiles.json`'s own `name`, carried on the arm by `runBatch` —
   * one source, not a second table in a renderer.
   */
  it('prints the display name in the comparison prose, never the slug alone', () => {
    const report = batchReport(fakeResult({ delta: -3 }));
    for (const row of report.comparisons[0]?.rows ?? []) {
      const mentions = /Minimum estimated wait|Conventional collective/.test(row.sentence);
      /*
       * The display names are removed **first**, because *Conventional collective* contains the
       * word `collective` and a naive search for the slug matches its own replacement. What is
       * left is a slug standing on its own, which is what the reader could not resolve.
       */
      const withoutNames = row.sentence
        .replaceAll('Minimum estimated wait', '·')
        .replaceAll('Conventional collective', '·');
      expect(/\b(?:eta|collective)\b/.test(withoutNames), `${row.metric}: ${row.sentence}`).toBe(false);
      if (['awtS', 'wt95S', 'ttdMeanS'].includes(row.metric)) continue; // suppressed rows name no arm
      expect(mentions, `${row.metric}: ${row.sentence}`).toBe(true);
    }
  });

  it('establishes the pairing once, on the arm row, in the picker’s own form', () => {
    // `Name (slug)` — the form the building picker already uses, so the reader can map the row
    // back to the dropdown they set. Once, not on all eight comparison rows.
    const report = batchReport(fakeResult({ delta: -3 }));
    expect(report.arms[0]?.sentence).toContain('Conventional collective (collective)');
    expect(report.arms[1]?.sentence).toContain('Minimum estimated wait (eta)');
    expect(report.comparisons[0]?.baselineProfileName).toBe('Conventional collective');
    expect(report.comparisons[0]?.candidateProfileName).toBe('Minimum estimated wait');
  });
});

describe('the summary — it counts and routes, and it never names a winner', () => {
  it('routes every row into exactly one bucket, and the buckets are the verdicts', () => {
    const report = batchReport(fakeResult({ delta: -3 }));
    const summary = summaryOf(report);
    const counted =
      summary.resolved.length +
      summary.unresolved.length +
      summary.suppressed.length +
      summary.unmeasured.length +
      summary.shown.length +
      summary.underBudget.length;
    expect(counted).toBe(report.comparisons[0]?.rows.length);
    // …and every bucket agrees with the row it came from, so the summary cannot drift from them.
    for (const metric of summary.resolved) expect(rowFor(report, metric).verdict).toBe('resolved');
    for (const metric of summary.shown) expect(rowFor(report, metric).verdict).toBe('shown');
  });

  it('names the measures that separated the two and leaves the arm to the row', () => {
    /*
     * **The clause this whole object exists to not have.** CLAUDE.md: never declare one dispatcher
     * better than another without a paired-t interval that excludes zero. A row that has one says
     * so itself, under `compareMetric`'s gate; a summary line that repeated the winner would be a
     * second place deciding it, and a summary line that named one where no row resolved would be
     * the failure mode this project has refused its own feature over three times.
     */
    const summary = summaryOf(batchReport(fakeResult({ delta: -3 })));
    expect(summary.sentence).toContain('separated the two');
    expect(summary.sentence).toContain('average wait');
    expect(summary.sentence).toContain('names the arm ahead');
    // The summary itself orders nothing: no arm is put ahead of the other in it.
    expect(summary.sentence).not.toContain('came out ahead');
    expect(summary.sentence).not.toMatch(/\b(?:better|worse|beat|won|wins|winner)\b/i);
  });

  it('says plainly, in the summary, when nothing separated the two', () => {
    // The tie: two bit-identical arms. Every interval contains zero and the reader is told that
    // in words rather than left to reconcile eight rows.
    const summary = summaryOf(batchReport(fakeResult({ delta: 0 })));
    expect(summary.resolved).toEqual([]);
    expect(summary.sentence).toContain('interval containing zero');
    expect(summary.sentence).toContain('no difference this batch can resolve');
  });

  it('never claims an ordering the rows did not license', () => {
    // Below the budget every row is `under-budget`, and the summary says so rather than promoting
    // it. R2's lower bound, read through the rows rather than restated here.
    const summary = summaryOf(batchReport(fakeResult({ delta: -3, replications: 8 })));
    expect(summary.resolved).toEqual([]);
    expect(summary.underBudget.length).toBeGreaterThan(0);
    expect(summary.sentence).toContain('too few paired runs to order the two');
  });
});

describe('the remedy — and the obvious one is wrong for half of it', () => {
  it('does not offer more replications for a suppressed row, because they make it worse', () => {
    /*
     * The measured reason, and the one a naive remedy gets backwards. Suppression is
     * complete-case: one bad pair in fifty empties the row, so a hundred replications is expected
     * to lose *two*. The lever is the demand control, which is the reason that control exists
     * (§ D158).
     */
    const summary = summaryOf(batchReport(fakeResult({ delta: -3, invalidOn: [17] })));
    expect(summary.remedy).not.toBeNull();
    expect(summary.remedy).toContain('more replications make this more common rather than less');
    expect(summary.remedy).toContain('demand %pop/5 min');
  });

  it('does offer more replications for an interval that contains zero, and names the budget', () => {
    const summary = summaryOf(batchReport(fakeResult({ delta: 0 })));
    expect(summary.remedy).toContain('50');
    expect(summary.remedy).toContain('200');
    expect(summary.remedy).toContain('is not a tie');
  });

  it('never suggests re-rolling the seed until the batch cooperates', () => {
    // Choosing the outcome. A remedy that taught it would undo the rest of this surface, so the
    // sentence that mentions seeds says the opposite in as many words.
    for (const report of [
      batchReport(fakeResult({ delta: 0 })),
      batchReport(fakeResult({ delta: -3, invalidOn: [17] })),
      batchReport(fakeResult({ delta: -3, replications: 200 })),
    ]) {
      const { remedy } = summaryOf(report);
      if (remedy === null) continue;
      expect(remedy).not.toMatch(/try (?:a|another) (?:different )?seed/i);
    }
    expect(summaryOf(batchReport(fakeResult({ delta: 0 }))).remedy).toContain('chooses the answer');
  });

  it('is null when every row spoke', () => {
    // Nothing to remedy — and a remedy printed anyway is noise that trains a reader to skip it.
    const summary = summaryOf(batchReport(fakeResult({ delta: -3 })));
    expect(summary.suppressed).toEqual([]);
    expect(summary.unresolved).toEqual([]);
    expect(summary.remedy).toBeNull();
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

/* ========================================================================== *
 * Issue #119 — the batch's disposition, said first and said as an answer
 * ========================================================================== */

describe('the answer is an answer, and never a winner', () => {
  it('says INDISTINGUISHABLE in as many words when nothing separated', () => {
    /*
     * The finding this closes: a batch where every interval contained zero rendered as *"3 came
     * back with an interval containing zero … 3 could not be compared at all"* — an inventory of
     * failures for a run that had a perfectly good result. *These two are not separated at n = 50*
     * is what happened, and it is what the first line now says.
     */
    const summary = summaryOf(batchReport(fakeResult({ delta: 0 })));
    expect(summary.resolved).toEqual([]);
    expect(summary.answer).toContain('Indistinguishable at n = 50');
    expect(summary.answer).toContain('not the same as the two settings being identical');
  });

  it('names the measures that separated and never the arm that won', () => {
    const report = batchReport(fakeResult({ delta: -3, spread: 0.2 }));
    const summary = summaryOf(report);
    expect(summary.resolved.length).toBeGreaterThan(0);
    expect(summary.answer).toContain('Separated on');
    expect(summary.answer).toContain('Each of those rows names the arm ahead');
    /*
     * The load-bearing negative. Every arm name the fixtures use is absent from this line, because
     * the direction lives on the row that earned the right to state it — a second place deciding
     * *better* is CLAUDE.md's named failure mode, and a roll-up is the easiest place to put one.
     */
    for (const arm of report.arms) {
      expect(summary.answer, arm.dispatcherProfileName).not.toContain(arm.dispatcherProfileName);
      expect(summary.answer, arm.dispatcherProfileId).not.toContain(arm.dispatcherProfileId);
    }
  });

  it('says so plainly when no measure could be compared at all', () => {
    // A broken CRN audit suppresses every row, which is the only shape that reaches this branch.
    const summary = summaryOf(batchReport(fakeResult({ delta: -3, aligned: false })));
    expect(summary.answer).toContain('No measure could be compared');
    expect(summary.answer).not.toContain('Indistinguishable');
  });
});

describe('the drop count is a sentence of its own', () => {
  it('leads with the count, the cause and the measures it cost', () => {
    /*
     * Issue #119 item 3, and the number in it is the shipped Chancery House case exactly: one
     * replication in fifty refuses a mean, and three headline rows go with it.
     */
    const summary = summaryOf(batchReport(fakeResult({ delta: -3, invalidOn: [11] })));
    expect(summary.droppedSentence).toContain('1 of 50 pairs dropped');
    expect(summary.droppedSentence).toContain('refuses to quote a mean');
    expect(summary.droppedSentence).toContain('average wait');
    expect(summary.droppedSentence).toContain('door-to-door time');
    // And the rows that are counts rather than means are said to be unaffected, because they are.
    expect(summary.droppedSentence).toContain('unaffected');
  });

  it('is null when the complete-case rule took nothing', () => {
    expect(summaryOf(batchReport(fakeResult({ delta: -3 }))).droppedSentence).toBeNull();
  });

  it('agrees with the rows it summarises', () => {
    const report = batchReport(fakeResult({ delta: -3, invalidOn: [2, 5, 40] }));
    const row = rowFor(report, 'awtS');
    expect(row.suppressedPairs).toBe(3);
    expect(summaryOf(report).droppedSentence).toContain('3 of 50 pairs dropped');
    // An observation row loses nothing, because the gate is on the estimate class.
    expect(rowFor(report, 'personsPer5Min').suppressedPairs).toBe(0);
  });
});

describe('what a batch with no mean can still say', () => {
  it('reports the capacity divergence the CLI has always reported and this surface never did', () => {
    /*
     * `packages/cli/src/commands/compare.ts`: *"A diverges at this load and B does not. That is a
     * finding about capacity, and it does not need a mean to be true."* The viewer had no such
     * sentence, which is why a batch that lost its three wait rows read as a batch that found
     * nothing.
     *
     * Built by hand rather than through `fakeResult`, because `invalidOn` applies to **both** arms
     * by construction — which is the right default for the suppression tests and is exactly the
     * symmetry this sentence must refuse. The asymmetry is what the shipped Chancery House default
     * had before this issue: `collective` lost one replication and `eta` lost none.
     */
    const asymmetric = {
      ...fakeResult({ delta: -3 }),
      arms: [
        fakeArm(
          'baseline',
          'collective',
          Array.from({ length: 50 }, (_, index) =>
            fakeReplication(index, 10, { awtIsValid: index !== 4 }),
          ),
          'Conventional collective',
        ),
        fakeArm(
          'candidate',
          'eta',
          Array.from({ length: 50 }, (_, index) => fakeReplication(index, 7)),
          'Minimum estimated wait',
        ),
      ],
    };
    const summary = summaryOf(batchReport(asymmetric));
    expect(summary.capacityFinding).toContain('Conventional collective');
    expect(summary.capacityFinding).toContain('queues never stopped growing in 1 of 50 runs');
    expect(summary.capacityFinding).toContain('finding about capacity');
    expect(summary.capacityFinding).toContain('does not need a mean to be true');
    // The reason it is admissible with every wait row suppressed: the arms saw the same people.
    expect(summary.capacityFinding).toContain('same passengers');
  });

  it('is null when the two arms lost the same number of runs', () => {
    /*
     * A sentence here would be manufacturing a divergence out of a symmetry. Both arms whole is
     * the obvious case; both arms losing equally is the one that matters, because that is Midtown
     * Office at its own demand — 50 of 50 saturated either way, and nothing to choose between them.
     */
    expect(summaryOf(batchReport(fakeResult({ delta: -3 }))).capacityFinding).toBeNull();
  });
});
