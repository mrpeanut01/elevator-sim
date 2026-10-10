/**
 * **A settled house verdict outlives a reload** — `dev/settledReadings.ts`, [§ D1380](../../../../DECISIONS.md),
 * the post-AN panel's seats B (defect 5) and D (D8).
 *
 * The close's tally read *The house is still being run on all 3 of them* after a reload, about days
 * earlier closes had settled. What a page cannot show quickly is held here on the store:
 * a settled verdict is kept, read back after the sitting's copy is gone, never replaced by a run's
 * failure, and bounded. `dev/main.ts#askWeekHouse` and `#weekDriverRunReadingOf` read it before they
 * ask a run, and the browser tier's `dayClose.browser.test.ts` holds the tally across a reload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SETTLED_READINGS_KEY,
  SETTLED_READINGS_MAX,
  settledReadingsFrom,
  settledReadingsText,
} from './settledReadings.js';

/** A stand-in for the one storage the shell has, so a module re-import is a new sitting. */
function memoryStorage(): Storage {
  const slots = new Map<string, string>();
  return {
    get length() {
      return slots.size;
    },
    clear: () => slots.clear(),
    getItem: (key) => slots.get(key) ?? null,
    key: (index) => [...slots.keys()][index] ?? null,
    removeItem: (key) => {
      slots.delete(key);
    },
    setItem: (key, value) => {
      slots.set(key, value);
    },
  };
}

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The module as a fresh sitting meets it: nothing held in memory, only what storage kept. */
async function freshSitting(): Promise<typeof import('./settledReadings.js')> {
  vi.resetModules();
  return import('./settledReadings.js');
}

describe('a settled verdict is kept across a reload — § D1380', () => {
  it('reads back what an earlier sitting settled, for the house and the driver run apart', async () => {
    const first = await freshSitting();
    first.keepSettled('house', 'c2|1|ordinary|424242', 'missed');
    first.keepSettled('driver', 'c2|ordinary|{}', 'cleared');
    expect(storage.getItem(SETTLED_READINGS_KEY)).not.toBeNull();

    const after = await freshSitting();
    expect(after.settledReadingOf('house', 'c2|1|ordinary|424242')).toBe('missed');
    expect(after.settledReadingOf('driver', 'c2|ordinary|{}')).toBe('cleared');
    expect(after.settledReadingOf('house', 'c2|ordinary|{}')).toBeUndefined();
  });

  it('keeps only a verdict a run returned, never a failure or a reading still pending', async () => {
    const first = await freshSitting();
    first.keepSettled('house', 'a', 'unrecorded');
    first.keepSettled('house', 'b', 'pending');
    first.keepSettled('house', 'c', 'ungraded');
    const after = await freshSitting();
    expect(after.settledReadingOf('house', 'a')).toBeUndefined();
    expect(after.settledReadingOf('house', 'b')).toBeUndefined();
    expect(after.settledReadingOf('house', 'c')).toBe('ungraded');
  });

  it('reads nothing from a damaged slot, and drops the oldest past its bound', () => {
    expect(settledReadingsFrom('not json').size).toBe(0);
    expect(settledReadingsFrom(JSON.stringify({ entries: [['k', 'bogus'], ['j', 'cleared'], 7] }))).toEqual(
      new Map([['j', 'cleared']]),
    );
    const many = new Map(Array.from({ length: SETTLED_READINGS_MAX + 5 }, (_, index) => [`k${String(index)}`, 'missed' as const]));
    const kept = settledReadingsFrom(settledReadingsText(many));
    expect(kept.size).toBe(SETTLED_READINGS_MAX);
    expect(kept.has('k0')).toBe(false);
    expect(kept.has(`k${String(SETTLED_READINGS_MAX + 4)}`)).toBe(true);
  });

  it('fails quietly where there is no storage to reach', async () => {
    vi.stubGlobal('localStorage', undefined);
    const sitting = await freshSitting();
    expect(() => sitting.keepSettled('house', 'k', 'cleared')).not.toThrow();
    expect(sitting.settledReadingOf('house', 'k')).toBe('cleared');
  });
});
