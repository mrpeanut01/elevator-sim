/**
 * The bench's model, held to the four things § 12 says it must never stop being.
 *
 * 1. **The field's bounds are enforced, and enforced in the right place.** Two at least is
 *    arithmetic and the floor is on the type; four at most is a screen's limit and lives here.
 * 2. **The budget control is live.** *"Below thirty the bench can rarely tell anything apart"* is
 *    an honest note only if the number it is about actually changes the answer — so the case below
 *    puts ten replications and two hundred through the report and requires the interval to be
 *    visibly narrower at two hundred. That is the standing requirement (*move the control and
 *    require the run to change*) pointed at the one control whose whole purpose is resolution.
 * 3. **A field of three draws no pairwise verdict.** Not by a rule this module authors: by
 *    `batchReport` producing two comparisons and `suiteCellViewOf` refusing on the count.
 * 4. **No verdict is reworded.** `report.ts`'s six survive into the index; *"Too close to call"*
 *    appears **beside** `unresolved`, never in place of it or of `under-budget`.
 */

import { describe, expect, it } from 'vitest';

import { intervalPlotFor } from '../batch/intervalPlot.js';
import { batchReport, MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { fakeArm, fakeReplication, fakeResult } from '../batch/fixtures.test-helper.js';
import { suiteCellViewOf, suiteSummaryOf } from '../batch/suite.js';
import type { BatchResult } from '../batch/types.js';

import {
  benchBudgetNoteOf,
  benchEntrantsOf,
  benchFieldOf,
  benchFieldRefusal,
  benchResultViewOf,
  benchTestsOf,
  benchTestsRefusal,
  benchVerdictNoteOf,
  benchWorkLineOf,
  BENCH_COPY,
  BENCH_FIELD_MAX,
  BENCH_REPLICATION_CHOICES,
  BENCH_STANDING_NOTES,
} from './benchModel.js';

const SHELF = [
  { id: 'collective', name: 'Conventional collective' },
  { id: 'eta', name: 'Minimum estimated wait' },
  { id: 'nearest-car', name: 'Nearest car' },
  { id: 'fairness-first', name: 'Fairness first' },
  { id: 'energy-aware', name: 'Energy aware' },
];

const CELL = { id: 'midtown-up-peak', label: 'Midtown Office, up-peak 1 %' };

describe('§12.1 — the field is two at least and four at most', () => {
  it('refuses under two and over four, in two different sentences', () => {
    expect(benchFieldRefusal([])).toMatch(/at least 2/);
    expect(benchFieldRefusal(['collective'])).toMatch(/nothing to be compared with/);
    expect(benchFieldRefusal(['a', 'b'])).toBeUndefined();
    expect(benchFieldRefusal(['a', 'b', 'c', 'd'])).toBeUndefined();
    expect(benchFieldRefusal(['a', 'b', 'c', 'd', 'e'])).toMatch(/At most 4/);
  });

  it('stops offering unpicked toggles at the ceiling, and never the picked ones', () => {
    const picked = SHELF.slice(0, BENCH_FIELD_MAX).map((entry) => entry.id);
    const entrants = benchEntrantsOf(SHELF, picked);
    for (const entrant of entrants) {
      // A picked entrant must stay pressable or a full field has no way back out.
      if (entrant.picked) expect(entrant.refusal).toBeUndefined();
      else expect(entrant.refusal).toMatch(/The field is full at 4/);
    }
    // Under the ceiling nothing is refused.
    expect(benchEntrantsOf(SHELF, ['collective']).every((e) => e.refusal === undefined)).toBe(true);
  });

  it('builds arms that carry the profile id and never show an arm id', () => {
    const field = benchFieldOf(['collective', 'eta', 'nearest-car']);
    expect(field?.map((arm) => arm.dispatcherProfileId)).toEqual([
      'collective',
      'eta',
      'nearest-car',
    ]);
    expect(field).toHaveLength(3);
    expect(benchFieldOf(['collective'])).toBeUndefined();
    expect(benchFieldOf([])).toBeUndefined();
  });
});

describe('§12.1 — the tests come from the matrix, not from a second list', () => {
  it('offers a test per matrix cell and ticks exactly what was asked for', () => {
    const tests = benchTestsOf(['midtown-up-peak']);
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.filter((test) => test.ticked).map((test) => test.cellId)).toEqual([
      'midtown-up-peak',
    ]);
    // The label names the pattern, which the id alone does not — two ticks on one building differ
    // by exactly that.
    expect(tests[0]?.label).toContain(',');
  });

  it('refuses an empty tick list in §12.1’s own words', () => {
    expect(benchTestsRefusal([])).toBe('No tests ticked. Pick at least one.');
    expect(benchTestsRefusal(['midtown-up-peak'])).toBeUndefined();
  });
});

describe('§12.1 — the work line counts the field as well as the tests', () => {
  it('reproduces the guide’s own example', () => {
    expect(benchWorkLineOf(3, 50, 3)).toBe('3 tests · 450 days of simulation');
  });

  it('moves with every one of its three inputs, and says “test” in the singular', () => {
    expect(benchWorkLineOf(1, 10, 2)).toBe('1 test · 20 days of simulation');
    expect(benchWorkLineOf(1, 10, 4)).toBe('1 test · 40 days of simulation');
    expect(benchWorkLineOf(2, 200, 2)).toBe('2 tests · 800 days of simulation');
  });
});

describe('§12.1 — the budget note, in two sentences that are not the same claim', () => {
  it('offers the four choices, with the published floor and ceiling read from report.ts', () => {
    expect(BENCH_REPLICATION_CHOICES).toEqual([10, 30, 50, 200]);
    expect(BENCH_REPLICATION_CHOICES).toContain(MIN_REPLICATION_BUDGET);
  });

  it('says the instrument is blind below thirty and that no winner is named below fifty', () => {
    expect(benchBudgetNoteOf(10)).toBe(BENCH_COPY.repsBelowThirty);
    expect(benchBudgetNoteOf(10)).toMatch(/rarely tell anything apart/);
    expect(benchBudgetNoteOf(30)).toBe(BENCH_COPY.repsBelowBudget);
    expect(benchBudgetNoteOf(30)).toMatch(/no row here will name a winner/);
    expect(benchBudgetNoteOf(50)).toBeUndefined();
    expect(benchBudgetNoteOf(200)).toBeUndefined();
  });

  /**
   * The control is live, measured on what it is *for*.
   *
   * A note about resolution that sat over a number changing nothing would be § D219's defect with
   * a friendlier face, so this runs the same paired difference through `batchReport` at ten
   * replications and at two hundred and requires the drawn interval to be materially narrower —
   * not merely different. The fixture's `spread` is what gives the paired differences a variance
   * to shrink; at `spread: 0` every difference is exactly `delta` and no width could move.
   */
  it('narrows the drawn interval when the replication count rises — 10 against 200', () => {
    const widthAt = (replications: number): number => {
      const report = batchReport(fakeResult({ replications, delta: 1.4, spread: 0.9 }));
      const row = report.comparisons[0]?.rows.find((entry) => entry.metric === 'awtS');
      const plot = row === undefined ? null : intervalPlotFor(row);
      if (plot === null) throw new Error('the fixture drew no interval to measure');
      return plot.upper - plot.lower;
    };

    const ten = widthAt(10);
    const twoHundred = widthAt(200);
    expect(twoHundred).toBeLessThan(ten);
    // Visibly, not marginally: a reader has to be able to see that more days bought resolution.
    expect(twoHundred).toBeLessThan(ten / 2);
  });
});

describe('§12.2 — the pairwise verdict draws only for a field of two', () => {
  it('draws it at two, and says so at the top of the screen', () => {
    const view = suiteCellViewOf(CELL, fakeResult({ replications: 50, delta: 1.2, spread: 0.4 }));
    expect(view.verdictShown).toBe(true);
    expect(view.verdictRefusal).toBeNull();
    expect(view.rows.length).toBeGreaterThan(0);
    expect(benchVerdictNoteOf(2)).toMatch(/pairwise answer/);
  });

  it('draws none at three, refuses in the cell’s own words, and says so at the top', () => {
    const three = threeArmResult();
    expect(batchReport(three).comparisons).toHaveLength(2);

    const view = suiteCellViewOf(CELL, three);
    expect(view.verdictShown).toBe(false);
    expect(view.rows).toHaveLength(0);
    expect(view.answer).toBeNull();
    expect(view.verdictRefusal).toMatch(/only for a field of two/);
    expect(view.arms).toHaveLength(3);

    const note = benchVerdictNoteOf(3);
    expect(note).toMatch(/no single pairwise answer/);
    expect(note).not.toMatch(/pairwise answer below each test/);
  });

  it('carries the three-arm refusal into the index as the line’s note, with no marks', () => {
    const view = suiteCellViewOf(CELL, threeArmResult());
    const summary = suiteSummaryOf([view]);
    expect(summary.metricLabels).toHaveLength(0);
    expect(summary.lines[0]?.marks).toHaveLength(0);
    expect(summary.lines[0]?.note).toBe(view.verdictRefusal);
  });
});

describe('the result view is strictly weaker than the report it reads', () => {
  it('keeps report.ts’s own verdict words in the index', () => {
    const view = benchResultViewOf([
      suiteCellViewOf(CELL, fakeResult({ replications: 10, delta: 1.2, spread: 0.4 })),
    ]);
    const marks = view.summary.lines[0]?.marks.filter((mark) => mark !== null) ?? [];
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured']).toContain(
        mark?.verdict,
      );
      // A friendly phrase may sit beside a verdict; it may never replace one.
      expect(mark?.text).not.toBe(BENCH_COPY.tooCloseHeading);
    }
  });

  it('lists a cell as too-close only where a drawn row is `unresolved`', () => {
    /* Two identical arms: every paired difference is exactly zero, so no row is ordered. */
    const tie = benchResultViewOf([suiteCellViewOf(CELL, fakeResult({ replications: 50 }))]);
    expect(tie.tooCloseCellIds).toEqual([CELL.id]);

    /* A three-arm cell draws no verdict block at all, so it can never be listed. */
    const many = benchResultViewOf([suiteCellViewOf(CELL, threeArmResult())]);
    expect(many.tooCloseCellIds).toEqual([]);
  });

  it('always carries §12’s three standing notes and the never-a-subtraction rule', () => {
    const view = benchResultViewOf([]);
    expect(view.standingNotes).toEqual(BENCH_STANDING_NOTES);
    expect(view.standingNotes).toHaveLength(3);
    expect(view.neverASubtraction).toMatch(/is not a comparison/);
    expect(view.cells).toHaveLength(0);
  });
});

/** A three-arm batch, built from the same fixtures the two-arm one uses. */
function threeArmResult(): BatchResult {
  const two = fakeResult({ replications: 50, delta: 1.2, spread: 0.4 });
  const third = Array.from({ length: 50 }, (_, index) =>
    fakeReplication(index, 12 + ((index * 13) % 9) / 10),
  );
  return { ...two, arms: [...two.arms, fakeArm('third', 'nearest-car', third)] };
}
