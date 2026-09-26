/**
 * **The par mark's rule** — `scenario/par.ts`, [§ D1234](../../../../DECISIONS.md). Pure, one arm
 * per clause: under, at, above, a free par, and the two absences.
 */
import { describe, expect, it } from 'vitest';

import { parMarkOf } from './par.js';

describe('a par mark is earned at or under a priced par and nowhere else', () => {
  it('marks under and at a priced par, and nothing above it', () => {
    expect(parMarkOf(4, 3)).toBe('under');
    expect(parMarkOf(4, 4)).toBe('at');
    expect(parMarkOf(4, 5)).toBeUndefined();
  });

  it('never marks a free par, which every clear that buys nothing meets', () => {
    expect(parMarkOf(0, 0)).toBeUndefined();
    expect(parMarkOf(0, 2)).toBeUndefined();
  });

  it('marks nothing without a par or without a kept cost', () => {
    expect(parMarkOf(undefined, 2)).toBeUndefined();
    expect(parMarkOf(null, 2)).toBeUndefined();
    expect(parMarkOf(4, undefined)).toBeUndefined();
  });
});
