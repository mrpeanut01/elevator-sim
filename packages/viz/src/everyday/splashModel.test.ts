import { describe, expect, it } from 'vitest';

import { SPLASH_CEILING_MS, SPLASH_FLOOR, SPLASH_TIMINGS, splashTimingsFor } from './splashModel.js';

describe('the opening doors', () => {
  it('is gone within the owner’s five seconds', () => {
    expect(SPLASH_CEILING_MS).toBe(5000);
    expect(SPLASH_TIMINGS.goneAtMs).toBeLessThanOrEqual(SPLASH_CEILING_MS);
  });

  it('runs its parts in order and lets each finish before the splash is removed', () => {
    const t = SPLASH_TIMINGS;
    expect(t.lanternAtMs).toBeGreaterThanOrEqual(0);
    expect(t.lanternAtMs).toBeLessThan(t.doorsAtMs);
    expect(t.doorsAtMs).toBeLessThan(t.fadeAtMs);
    /* The frame fades only once the doors are most of the way open. */
    expect(t.fadeAtMs).toBeGreaterThanOrEqual(t.doorsAtMs + t.doorsMs * 0.75);
    expect(t.doorsAtMs + t.doorsMs).toBeLessThanOrEqual(t.goneAtMs);
    expect(t.fadeAtMs + t.fadeMs).toBeLessThanOrEqual(t.goneAtMs);
  });

  it('plays nothing under reduced motion', () => {
    expect(splashTimingsFor(true)).toBeUndefined();
    expect(splashTimingsFor(false)).toBe(SPLASH_TIMINGS);
  });

  it('arrives at the lobby', () => {
    expect(SPLASH_FLOOR).toBe('L');
  });
});
