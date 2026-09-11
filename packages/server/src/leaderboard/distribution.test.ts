/**
 * The ladder's arithmetic and its refusals — GitHub issue #327, § D484. Every rule the ruling
 * stated is a case here, driven on plain observations rather than on a store.
 */

import { describe, expect, it } from 'vitest';

import {
  DISTRIBUTION_NOTE,
  LADDER_RUNGS,
  MIN_LADDER_N,
  axisLadderOf,
  boardDistributionOf,
  heldLadderOf,
  quantileOf,
  type AxisObservation,
} from './distribution.js';

function observations(values: readonly number[]): readonly AxisObservation[] {
  return values.map((value, index) => ({ entryId: `e${String(index)}`, value }));
}

describe('quantileOf — type 7, interpolated between real runs', () => {
  it('returns the order statistics at the ends and interpolates between them', () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(quantileOf(sorted, 0)).toBe(1);
    expect(quantileOf(sorted, 1)).toBe(5);
    expect(quantileOf(sorted, 0.5)).toBe(3);
    expect(quantileOf(sorted, 0.25)).toBe(2);
    expect(quantileOf(sorted, 0.1)).toBeCloseTo(1.4, 9);
  });

  it('never publishes a value outside the observations', () => {
    const sorted = Array.from({ length: 37 }, (_unused, index) => index * 1.7 + 3);
    for (const p of LADDER_RUNGS) {
      const q = quantileOf(sorted, p);
      expect(q).toBeGreaterThanOrEqual(sorted[0]!);
      expect(q).toBeLessThanOrEqual(sorted[sorted.length - 1]!);
    }
  });

  it('refuses an empty list rather than inventing a figure', () => {
    expect(() => quantileOf([], 0.5)).toThrow(/no observations/u);
  });
});

describe('axisLadderOf — withheld below the floor, a real entry at the median', () => {
  it('withholds the rungs and the median entry below the floor, and still publishes the count', () => {
    const ladder = axisLadderOf('awtS', observations(Array.from({ length: MIN_LADDER_N - 1 }, (_u, i) => i)));
    expect(ladder.n).toBe(MIN_LADDER_N - 1);
    expect(ladder.rungs).toBeUndefined();
    expect(ladder.medianEntryId).toBeUndefined();
  });

  it('publishes five rungs at the floor, ordered, with the lower median’s own entry id', () => {
    const values = Array.from({ length: MIN_LADDER_N }, (_u, i) => 30 - i * 0.5);
    const ladder = axisLadderOf('wt95S', observations(values));
    expect(ladder.n).toBe(MIN_LADDER_N);
    const rungs = ladder.rungs!;
    expect(rungs.p10).toBeLessThanOrEqual(rungs.p25);
    expect(rungs.p25).toBeLessThanOrEqual(rungs.p50);
    expect(rungs.p50).toBeLessThanOrEqual(rungs.p75);
    expect(rungs.p75).toBeLessThanOrEqual(rungs.p90);
    /* The median entry is a run somebody played: its value is one of the observations, at the lower median. */
    const sorted = [...values].sort((a, b) => a - b);
    const lowerMedian = sorted[Math.floor((values.length - 1) / 2)]!;
    const chosen = values.findIndex((value) => value === lowerMedian);
    expect(ladder.medianEntryId).toBe(`e${String(chosen)}`);
  });

  it('is one axis and never a vector: two axes can name two different median entries', () => {
    const awt = axisLadderOf('awtS', observations(Array.from({ length: 21 }, (_u, i) => i)));
    /* The same twenty-one players, one of them far worse on this axis, so its median is another run. */
    const wt95 = axisLadderOf('wt95S', observations(Array.from({ length: 21 }, (_u, i) => (i === 10 ? 100 : i))));
    expect(awt.medianEntryId).not.toBe(wt95.medianEntryId);
  });
});

describe('boardDistributionOf', () => {
  it('names energy as absent with the reason, carries the note, and withholds below the floor with the count', () => {
    const few = boardDistributionOf('daily:2026-09-06', new Map([['awtS', observations([1, 2, 3])]]));
    expect(few.n).toBe(3);
    expect(few.withheld).toContain('3 players');
    expect(few.withheld).toContain(String(MIN_LADDER_N));
    expect(few.absent.map((entry) => entry.axis)).toEqual(['energy']);
    expect(few.note).toBe(DISTRIBUTION_NOTE);
    /* The note names the interval it refuses — a refusal may — and nothing on the wire draws one. */
    expect(few.note).toMatch(/No interval is published/u);
    expect(JSON.stringify(few)).not.toMatch(/±|ci95|lower|upper|halfWidth/iu);
  });

  it('publishes the ladders at the floor and says nothing is withheld', () => {
    const enough = boardDistributionOf(
      'daily:2026-09-06',
      new Map([['awtS', observations(Array.from({ length: MIN_LADDER_N }, (_u, i) => i + 10))]]),
    );
    expect(enough.withheld).toBeUndefined();
    expect(enough.ladders[0]?.rungs?.p50).toBeCloseTo(19.5, 9);
  });
});

describe('the rush board’s ladder — how long people held, GitHub issue #372', () => {
  it('withholds the rungs below twenty players and still publishes the count', () => {
    const ladder = heldLadderOf('rush:garden-apartments:2026-09-01', observations([1_178, 1_092, 1_114]));
    expect(ladder.n).toBe(3);
    expect(ladder.rungs).toBeUndefined();
    expect(ladder.medianEntryId).toBeUndefined();
    expect(ladder.withheld).toContain(String(MIN_LADDER_N));
  });

  it('publishes the same five rungs every ladder does at twenty, and a real sitting at the median', () => {
    const values = Array.from({ length: MIN_LADDER_N }, (_unused, index) => 1_000 + index * 30);
    const ladder = heldLadderOf('rush:garden-apartments:2026-09-01', observations([...values].reverse()));
    expect(ladder.n).toBe(MIN_LADDER_N);
    expect(ladder.withheld).toBeUndefined();
    expect(ladder.rungs?.p50).toBeCloseTo(quantileOf(values, 0.5), 9);
    expect(ladder.rungs?.p10).toBeCloseTo(quantileOf(values, 0.1), 9);
    // The lower median of twenty ascending held times is the tenth, and it is somebody's sitting.
    const median = observations([...values].reverse()).find((row) => row.value === values[9]);
    expect(ladder.medianEntryId).toBe(median?.entryId);
    expect(ladder.note).toBe(DISTRIBUTION_NOTE);
  });
});
