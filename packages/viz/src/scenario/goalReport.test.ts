/**
 * The Compare tab's goal block: what it says, and — more importantly — what it refuses to say.
 */

import { describe, expect, it } from 'vitest';

import { goalReport } from './goalReport.js';
import { fakeArm, fakeReplication, fakeResult } from '../batch/fixtures.test-helper.js';
import type { BatchResult } from '../batch/types.js';

const VERDICT_WORDS = /\b(?:goal met|you won|you lost|achieved|well played|passed!|badge)\b/i;

function resultWith(saturatedOn: readonly number[], n = 50): BatchResult {
  const base = fakeResult({ replications: n });
  const replications = Array.from({ length: n }, (_, i) =>
    fakeReplication(i, 10, { saturated: saturatedOn.includes(i) }),
  );
  return { ...base, arms: [fakeArm('only', 'collective', replications)] };
}

describe('the goal block', () => {
  it('reports one row per measurable kind per arm, and nothing per replication', () => {
    const report = goalReport(fakeResult({ replications: 50 }));
    /* Five measurable kinds, two arms. */
    expect(report.rows).toHaveLength(10);
    expect(new Set(report.rows.map((row) => row.armId))).toEqual(
      new Set(['baseline', 'candidate']),
    );
  });

  it('names the two kinds it cannot take a rate of, and distinguishes their reasons', () => {
    const report = goalReport(fakeResult({ replications: 50 }));
    expect(report.withheld).toHaveLength(2);
    const text = report.withheld.map((item) => `${item.label}: ${item.reason}`).join('\n');
    expect(text).toContain('everyone-can-get-there');
    expect(text).toMatch(/credential/i);
    expect(text).toContain('beat-the-baseline');
    expect(text).toMatch(/difference between two arms/i);
  });

  it('calls a constant a fact about the configuration rather than a win', () => {
    const report = goalReport(resultWith([]));
    const divergence = report.rows.find((row) => row.label === 'no-divergence');
    expect(divergence?.rateClass).toBe('constant-pass');
    expect(divergence?.disposition).toBe('configuration-fact');
    expect(divergence?.sentence).toContain('50 of 50');
  });

  it('calls a mixed rate a batch goal and states the fraction', () => {
    const report = goalReport(resultWith([0, 1, 2, 3, 4, 5, 6]));
    const divergence = report.rows.find((row) => row.label === 'no-divergence');
    expect(divergence?.disposition).toBe('batch');
    expect(divergence?.sentence).toContain('43 of 50');
  });

  it('says so when the batch is below R12’s floor, rather than reporting a rate that reads like one', () => {
    const small = goalReport(resultWith([], 8));
    expect(small.floorNote).not.toBeNull();
    expect(small.floorNote).toContain('8 replications');
    expect(goalReport(resultWith([], 50)).floorNote).toBeNull();
  });

  it('emits no verdict language anywhere', () => {
    /*
     * R2 and R12 together: this surface may say how often a goal passed and what that makes it.
     * It may not say the goal was met — a badge on one replication of a 43-of-50 configuration is
     * the coin flip § 1 measured, presented as a skill outcome.
     */
    for (const report of [resultWith([]), resultWith([1, 2]), resultWith([], 8)].map((result) =>
      goalReport(result),
    )) {
      const text = [
        report.floorNote ?? '',
        ...report.rows.map((row) => row.sentence),
        ...report.withheld.map((item) => item.reason),
      ].join('\n');
      expect(VERDICT_WORDS.test(text), text).toBe(false);
    }
  });

  it('negative control: the verdict word list really does catch a badge', () => {
    expect(VERDICT_WORDS.test('goal met — well played')).toBe(true);
  });
});
