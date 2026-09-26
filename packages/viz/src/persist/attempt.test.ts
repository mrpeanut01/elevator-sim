/**
 * `persist/attempt.ts` — the attempts standing on this device's scored days survive a reload,
 * wave AL, lane AL-E, § D1218.
 */

import { describe, expect, it } from 'vitest';

import type { DayAttempt } from '../shift/attempt.js';

import { ATTEMPT_KEY, loadAttempts, saveAttempts } from './attempt.js';
import type { SessionStore } from './types.js';

function memoryStore(): SessionStore & { readonly slots: Map<string, string> } {
  const slots = new Map<string, string>();
  return {
    slots,
    read: (key) => slots.get(key) ?? null,
    write: (key, value) => {
      slots.set(key, value);
    },
    remove: (key) => {
      slots.delete(key);
    },
  };
}

const ATTEMPT: DayAttempt = {
  contractId: 'c7',
  day: 1,
  dayIdx: 0,
  seed: '20261003',
  daySeed: '20261003',
  dispatcherId: 'nearest-car',
  interventions: [{ atS: 549, change: { kind: 'spread-cars' } }],
  record: null,
  shownToS: 1800,
  pinnedCallDone: false,
  pressCallSkipped: false,
  calls: {
    records: [
      {
        atS: 549,
        windowEndS: 1149,
        answer: 'spread-cars',
        counts: { 'park-cars-lobby': 3, 'spread-cars': 1, leave: 5 },
        observations: {
          leave: { worstWaitS: Number.POSITIVE_INFINITY, meanWaitS: Number.NaN } as never,
        },
      },
    ],
    searchFromS: 849,
    asked: 1,
    refused: 0,
    done: false,
    ending: null,
    lost: null,
    raisedInPeak: [0],
    lastRaisedAtS: { placement: 549, driver: null },
    keptInPeakS: null,
    driving: null,
  },
};

describe('the attempts on this device — § D1218', () => {
  it('reads back what it wrote, non-finite folds included, keyed by contract', () => {
    const store = memoryStore();
    expect(saveAttempts(store, new Map([['c7', ATTEMPT]]))).toBe(true);
    const read = loadAttempts(store);
    expect([...read.keys()]).toEqual(['c7']);
    const back = read.get('c7');
    expect(back?.interventions).toEqual(ATTEMPT.interventions);
    expect(back?.shownToS).toBe(1800);
    const leave = back?.calls?.records[0]?.observations.leave as unknown as Record<string, number> | undefined;
    expect(leave?.['worstWaitS']).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(leave?.['meanWaitS'])).toBe(true);
  });

  it('clears the slot when no attempt stands', () => {
    const store = memoryStore();
    saveAttempts(store, new Map([['c7', ATTEMPT]]));
    saveAttempts(store, new Map());
    expect(store.slots.has(ATTEMPT_KEY)).toBe(false);
    expect(loadAttempts(store).size).toBe(0);
  });

  it('drops what it cannot resume exactly rather than repairing it', () => {
    const store = memoryStore();
    const write = (value: unknown): void => {
      store.slots.set(ATTEMPT_KEY, JSON.stringify(value));
    };
    write({ version: 1, attempts: { c7: { ...ATTEMPT, seed: 'forty-two' }, c2: { ...ATTEMPT, contractId: 'c2' } } });
    expect([...loadAttempts(store).keys()]).toEqual(['c2']);
    write({ version: 1, attempts: { c3: ATTEMPT } });
    expect(loadAttempts(store).size, 'an attempt filed under another contract').toBe(0);
    write({ version: 2, attempts: { c7: ATTEMPT } });
    expect(loadAttempts(store).size, 'a version this build does not read').toBe(0);
    write({ version: 1, attempts: { c7: { ...ATTEMPT, interventions: [{ atS: 'soon', change: {} }] } } });
    expect(loadAttempts(store).size).toBe(0);
    store.slots.set(ATTEMPT_KEY, '{');
    expect(loadAttempts(store).size).toBe(0);
  });

  it('reads back § D1205\'s memory and drops a session that lost it — wave AL integration', () => {
    const store = memoryStore();
    saveAttempts(store, new Map([['c7', ATTEMPT]]));
    expect(loadAttempts(store).get('c7')?.calls).toMatchObject({
      raisedInPeak: [0],
      lastRaisedAtS: { placement: 549, driver: null },
      keptInPeakS: null,
      driving: null,
    });
    const write = (calls: unknown): void => {
      store.slots.set(ATTEMPT_KEY, JSON.stringify({ version: 1, attempts: { c7: { ...ATTEMPT, calls } } }));
    };
    const { raisedInPeak: _peaks, ...withoutPeaks } = ATTEMPT.calls!;
    write(withoutPeaks);
    expect(loadAttempts(store).size, 'a session without its peaks would raise a third call in one').toBe(0);
    write({ ...ATTEMPT.calls, lastRaisedAtS: { placement: 'soon', driver: null } });
    expect(loadAttempts(store).size).toBe(0);
    write({ ...ATTEMPT.calls, driving: 'collective' });
    expect(loadAttempts(store).size, 'who drives is a dispatcher, not a name').toBe(0);
  });

  it('treats a store that throws as a store with nothing in it', () => {
    const throwing: SessionStore = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => {
        throw new Error('QuotaExceededError');
      },
      remove: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadAttempts(throwing).size).toBe(0);
    expect(saveAttempts(throwing, new Map([['c7', ATTEMPT]]))).toBe(false);
  });
});
