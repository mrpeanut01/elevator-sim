/**
 * The drawn interval — GitHub issue #119, and the assertion that matters is the agreement one.
 *
 * ## What is worth testing here, and what is not
 *
 * Not the pixels. `intervalPlotFor` returns fractions and `dev/batchPanel.ts` turns them into
 * percentages, and a test that re-derived the same division would be the arithmetic written twice.
 *
 * What is worth testing is the **second opinion**. This module computes *does the interval cross
 * zero* from geometry — `zeroAt` outside `[lowerAt, upperAt]` — while `batch/report.ts` decides the
 * same question through `experiments`' shipped `intervalContainsZero`, which is *"the one line
 * between a paired interval and the overlap fallacy"*. Two answers to one question is exactly the
 * shape this repository keeps finding stale, so they are checked against each other over every row
 * a real batch can produce rather than trusted to agree.
 *
 * The other half is the one the picture could get **wrong in the direction that matters**: an
 * energy axis and an under-budget interval both draw a bar clear of zero and both refuse to name an
 * arm. `IntervalPlot.ranks` is copied from the verdict, so those cases are asserted to draw a bar
 * and to claim no ordering — a plot that inferred a winner from `upper < 0` would be the second
 * place deciding *better* that `BatchComparisonRow.favours` exists to prevent.
 *
 * `docs/16` S9: the **pure** tier. No document is needed, and none of these assertions is about a
 * node reaching the page — `dev/compareLab.browser.test.ts` is where the drawing is driven.
 */

import { intervalContainsZero } from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import { fakeArm, fakeReplication, fakeResult } from './fixtures.test-helper.js';
import { batchReport, type BatchComparisonRow } from './report.js';
import { intervalPlotFor } from './intervalPlot.js';
import { BATCH_METRICS, type BatchResult } from './types.js';

function rowsOf(result: BatchResult): readonly BatchComparisonRow[] {
  return batchReport(result).comparisons.flatMap((comparison) => comparison.rows);
}

describe('the geometry agrees with the estimator about zero', () => {
  it('matches `intervalContainsZero` on every row of a separated, a tied and a mixed batch', () => {
    /*
     * Three results rather than one, because the disagreement this guards against is asymmetric:
     * a plot that always said *excludes zero* would pass on the separated batch alone, and one
     * that always said *contains zero* would pass on the tie alone.
     */
    const results = [
      fakeResult({ delta: 4, spread: 0.2 }),
      fakeResult({ delta: 0 }),
      fakeResult({ delta: 0.05, spread: 1.5 }),
    ];
    let checked = 0;
    for (const result of results) {
      for (const row of rowsOf(result)) {
        const plot = intervalPlotFor(row);
        if (plot === null || row.estimate === null) continue;
        checked += 1;
        expect(
          plot.excludesZero,
          `${row.metric}: the plot and \`intervalContainsZero\` disagree about zero`,
        ).toBe(!intervalContainsZero(row.estimate));
      }
    }
    // Not vacuous: three results × eight metrics, minus nothing, is what should have been walked.
    expect(checked).toBe(results.length * BATCH_METRICS.length);
  });

  it('is not vacuous — the two answers really can be different values', () => {
    // Both branches are exercised above only if both occur. Asserted, rather than assumed from
    // the fixtures' deltas.
    const separated = rowsOf(fakeResult({ delta: 4, spread: 0.2 }))
      .map((row) => intervalPlotFor(row)?.excludesZero)
      .filter((value) => value === true);
    const tied = rowsOf(fakeResult({ delta: 0 }))
      .map((row) => intervalPlotFor(row)?.excludesZero)
      .filter((value) => value === false);
    expect(separated.length).toBeGreaterThan(0);
    expect(tied.length).toBeGreaterThan(0);
  });
});

describe('the plot never claims an ordering the row withheld', () => {
  it('draws the energy axis and refuses to rank it, however the interval fell', () => {
    // `delta: 4` separates every metric, energy included — which is the case R11 is about.
    const rows = rowsOf(fakeResult({ delta: 4, spread: 0.2 }));
    const energy = rows.find((row) => row.metric === 'energyKJ');
    const plot = intervalPlotFor(energy as BatchComparisonRow);
    expect(energy?.verdict).toBe('shown');
    expect(plot?.excludesZero).toBe(true);
    // The bar clears zero and the plot still orders nothing. This is the assertion.
    expect(plot?.ranks).toBe(false);
  });

  it('does the same for an interval that clears zero below the replication budget — § D171', () => {
    const rows = rowsOf(fakeResult({ replications: 8, delta: 4, spread: 0.2 }));
    const awt = rows.find((row) => row.metric === 'awtS');
    const plot = intervalPlotFor(awt as BatchComparisonRow);
    expect(awt?.verdict).toBe('under-budget');
    expect(plot?.excludesZero).toBe(true);
    expect(plot?.ranks).toBe(false);
  });

  it('ranks only a resolved row', () => {
    const rows = rowsOf(fakeResult({ delta: 4, spread: 0.2 }));
    for (const row of rows) {
      const plot = intervalPlotFor(row);
      if (plot === null) continue;
      expect(plot.ranks, row.metric).toBe(row.verdict === 'resolved');
    }
  });
});

describe('the domain always contains zero and the whole interval', () => {
  it('puts every mark inside the plot, on a separated batch', () => {
    for (const row of rowsOf(fakeResult({ delta: 4, spread: 0.2 }))) {
      const plot = intervalPlotFor(row);
      if (plot === null) continue;
      for (const [name, at] of [
        ['zero', plot.zeroAt],
        ['lower', plot.lowerAt],
        ['mean', plot.meanAt],
        ['upper', plot.upperAt],
      ] as const) {
        expect(at, `${row.metric}/${name} is outside the plot`).toBeGreaterThanOrEqual(0);
        expect(at, `${row.metric}/${name} is outside the plot`).toBeLessThanOrEqual(1);
      }
      expect(plot.lowerAt).toBeLessThanOrEqual(plot.meanAt);
      expect(plot.meanAt).toBeLessThanOrEqual(plot.upperAt);
      // The zero line is never on the frame, so *touching zero* and *clipped* cannot be confused.
      expect(plot.zeroAt).toBeGreaterThan(0);
      expect(plot.zeroAt).toBeLessThan(1);
    }
  });

  it('draws a degenerate interval on the zero line rather than dividing by its own width', () => {
    /*
     * `[0, 0]` is not hypothetical: `unservedFraction` comes back exactly zero on four of the eight
     * shipped buildings at the panel's own default, and a span of zero is a division by zero away
     * from putting every mark at `NaN`.
     */
    const rows = rowsOf(fakeResult({ delta: 0 }));
    const row = rows.find((entry) => entry.metric === 'awtS');
    const plot = intervalPlotFor(row as BatchComparisonRow);
    expect(plot).not.toBeNull();
    expect(Number.isFinite(plot?.zeroAt ?? Number.NaN)).toBe(true);
    expect(plot?.zeroAt).toBeCloseTo(0.5, 6);
    expect(plot?.lowerAt).toBeCloseTo(0.5, 6);
    expect(plot?.upperAt).toBeCloseTo(0.5, 6);
    expect(plot?.excludesZero).toBe(false);
  });
});

describe('a row with no interval is drawn as no interval', () => {
  it('returns null on a suppressed row rather than inventing a bar', () => {
    // One replication in fifty refuses a mean — the shipped Chancery House case before this issue.
    const rows = rowsOf(fakeResult({ invalidOn: [7] }));
    const awt = rows.find((row) => row.metric === 'awtS');
    expect(awt?.verdict).toBe('suppressed');
    expect(intervalPlotFor(awt as BatchComparisonRow)).toBeNull();
  });

  it('returns null on an unmeasured row', () => {
    const rows = rowsOf(fakeResult({ nullMetricOn: [3], nullMetric: 'energyKJ' }));
    const energy = rows.find((row) => row.metric === 'energyKJ');
    expect(energy?.verdict).toBe('unmeasured');
    expect(intervalPlotFor(energy as BatchComparisonRow)).toBeNull();
  });

  it('returns null on a batch of one, where there is no spread to form an interval from', () => {
    /*
     * `compareMetric` routes a single pair to `unresolved` with **no** estimate — *"a single
     * replication has no measurable spread, so no interval can be formed"* — which is the last
     * shape that reaches this module without a number. Asserted over every metric rather than one,
     * because a plot drawn here would be a `left: NaN%` on every row at once.
     *
     * The `Number.isFinite` guard in `intervalPlotFor` is *below* this and is deliberately
     * defensive: no shipped path currently produces an estimate whose bounds are not numbers, and
     * `compareMetric` has a `!finite` branch of its own for the day one does. It is not claimed to
     * be exercised here, because it is not.
     */
    const result: BatchResult = {
      ...fakeResult({ replications: 2 }),
      arms: [
        fakeArm('baseline', 'collective', [fakeReplication(0, 10)], 'Conventional collective'),
        fakeArm('candidate', 'eta', [fakeReplication(0, 12)], 'Minimum estimated wait'),
      ],
    };
    for (const row of rowsOf(result)) {
      expect(intervalPlotFor(row), row.metric).toBeNull();
    }
  });
});
