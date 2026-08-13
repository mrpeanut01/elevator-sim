/**
 * ENGINE_CONTRACT § 13's formatting rules, as far as the daily screens actually use them.
 *
 * The case worth having is the last one: § 13's *only* placeholder is the em dash, and the
 * difference between an absent figure and a measured zero is the difference between *the day is
 * not closed* and *nobody got away inside a minute*. A screen that printed `0%` for the first
 * would be § 16 rule 1's defect, and it would be invisible.
 *
 * The wait and clock rules are not tested here because they are not implemented here — the module
 * docstring records why, and it is a finding rather than a gap.
 */

import { describe, expect, it } from 'vitest';

import { countFigure, EM_DASH, groupThousands, percentFigure } from './figures.js';

describe('§ 13’s only placeholder', () => {
  it('is the em dash, on every function, for an absent figure', () => {
    expect(EM_DASH).toBe('—');
    expect(percentFigure(undefined)).toBe(EM_DASH);
    expect(countFigure(undefined)).toBe(EM_DASH);
  });

  it('distinguishes an absence from a measured zero, which is the whole point', () => {
    // `0%` is a claim — nobody got away inside a minute. The dash is *there is no figure at all*.
    expect(percentFigure(0)).toBe('0%');
    expect(countFigure(0)).toBe('0');
  });

  it('answers the dash for a non-finite number rather than printing NaN', () => {
    expect(percentFigure(Number.NaN)).toBe(EM_DASH);
    expect(countFigure(Number.POSITIVE_INFINITY)).toBe(EM_DASH);
  });
});

describe('the two rules these screens do use', () => {
  it('groups thousands with a comma, and does it without a locale', () => {
    expect(groupThousands(1710)).toBe('1,710');
    expect(groupThousands(14_203)).toBe('14,203');
    expect(groupThousands(999)).toBe('999');
    expect(countFigure(1_180)).toBe('1,180');
  });

  it('writes percentages as integers', () => {
    expect(percentFigure(80.6)).toBe('81%');
    expect(percentFigure(78)).toBe('78%');
  });
});
