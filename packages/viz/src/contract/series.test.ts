import { describe, expect, it } from 'vitest';

import { StepSeriesBuilder, constantSeries, lastAtOrBefore, stepValueAt } from './series.js';

describe('StepSeriesBuilder', () => {
  it('keeps one entry per distinct time, holding the last value written at it', () => {
    const builder = new StepSeriesBuilder(0);
    builder.push(0, 1);
    builder.push(5, 2);
    builder.push(5, 3);
    builder.push(9, 4);
    const series = builder.build();
    expect(series.times).toEqual([0, 5, 9]);
    expect(series.values).toEqual([1, 3, 4]);
  });

  it('refuses a decreasing time rather than producing an order-dependent series', () => {
    const builder = new StepSeriesBuilder(0);
    builder.push(10, 1);
    expect(() => {
      builder.push(9, 2);
    }).toThrow(/time order/);
  });
});

describe('stepValueAt', () => {
  const series = (() => {
    const builder = new StepSeriesBuilder(-1);
    builder.push(10, 1);
    builder.push(20, 2);
    builder.push(30, 3);
    return builder.build();
  })();

  it('reads `before` earlier than the first entry', () => {
    expect(stepValueAt(series, -100)).toBe(-1);
    expect(stepValueAt(series, 9.999)).toBe(-1);
  });

  it('is right-continuous: a change at exactly t is visible at t', () => {
    expect(stepValueAt(series, 10)).toBe(1);
    expect(stepValueAt(series, 20)).toBe(2);
  });

  it('holds the last value after the final entry', () => {
    expect(stepValueAt(series, 30)).toBe(3);
    expect(stepValueAt(series, 1e6)).toBe(3);
  });

  it('does not depend on the order the samples are requested in', () => {
    const ascending = [0, 10, 15, 20, 25, 30, 40].map((t) => stepValueAt(series, t));
    const descending = [40, 30, 25, 20, 15, 10, 0].map((t) => stepValueAt(series, t)).reverse();
    expect(descending).toEqual(ascending);
  });

  it('reads a constant series everywhere', () => {
    expect(stepValueAt(constantSeries(7), -5)).toBe(7);
    expect(stepValueAt(constantSeries(7), 5000)).toBe(7);
  });
});

describe('lastAtOrBefore', () => {
  const entries = [{ at: 1 }, { at: 4 }, { at: 9 }];

  it('finds the entry in effect, inclusive of its own instant', () => {
    expect(lastAtOrBefore(entries, 4)).toEqual({ at: 4 });
    expect(lastAtOrBefore(entries, 8.9)).toEqual({ at: 4 });
    expect(lastAtOrBefore(entries, 100)).toEqual({ at: 9 });
  });

  it('is undefined before the first entry, and on an empty sequence', () => {
    expect(lastAtOrBefore(entries, 0)).toBeUndefined();
    expect(lastAtOrBefore([], 5)).toBeUndefined();
  });
});
