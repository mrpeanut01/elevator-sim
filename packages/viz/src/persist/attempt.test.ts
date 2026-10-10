/**
 * `persist/attempt.ts` — the attempts standing on this device's scored days survive a reload,
 * wave AL, lane AL-E, § D1218.
 */

import { describe, expect, it } from 'vitest';

import type { DayAttempt } from '../shift/attempt.js';

import { ATTEMPT_KEY, loadAttempts, saveAttempts, writeAttemptSlot } from './attempt.js';
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

/*
 * Wave AO, lane AO-1, § D1361: one tab holds the saved attempt at a time. The slot is read at each
 * write and merged, so a tab that remembers an older slot cannot put it back.
 */
describe('one tab’s write to the slot — § D1361', () => {
  it('reads a holder back, reads an attempt stored before the rule, and drops a holder that is not a tab', () => {
    const store = memoryStore();
    saveAttempts(store, new Map([['c7', { ...ATTEMPT, holder: '0a1b2c3d4e5f6071' }]]));
    expect(loadAttempts(store).get('c7')?.holder).toBe('0a1b2c3d4e5f6071');
    saveAttempts(store, new Map([['c7', ATTEMPT]]));
    expect(loadAttempts(store).get('c7')?.holder, 'an attempt stored before wave AO').toBeUndefined();
    saveAttempts(store, new Map([['c7', { ...ATTEMPT, holder: 'Tab A' } as DayAttempt]]));
    expect(loadAttempts(store).size).toBe(0);
  });

  it('refuses a second tab’s write over the first tab’s attempt, and leaves the slot as the first tab wrote it', () => {
    const store = memoryStore();
    expect(writeAttemptSlot(store, 'c7', { kind: 'write', attempt: ATTEMPT }, 'aaaa').ok).toBe(true);
    const before = store.slots.get(ATTEMPT_KEY);
    const second = writeAttemptSlot(store, 'c7', { kind: 'write', attempt: { ...ATTEMPT, shownToS: 36000 } }, 'bbbb');
    expect(second.ok).toBe(false);
    expect(second.slot.get('c7')?.shownToS, 'the refusal hands back the slot as stored').toBe(1800);
    expect(store.slots.get(ATTEMPT_KEY)).toBe(before);
  });

  it('merges one contract’s write into the slot as stored, never the map a tab remembers', () => {
    const store = memoryStore();
    writeAttemptSlot(store, 'c7', { kind: 'write', attempt: ATTEMPT }, 'aaaa');
    writeAttemptSlot(store, 'c2', { kind: 'write', attempt: { ...ATTEMPT, contractId: 'c2' } }, 'bbbb');
    writeAttemptSlot(store, 'c7', { kind: 'write', attempt: { ...ATTEMPT, shownToS: 1900 } }, 'aaaa');
    const slot = loadAttempts(store);
    expect(slot.get('c2')?.holder).toBe('bbbb');
    expect(slot.get('c7')?.shownToS).toBe(1900);
  });

  it('claims on the pressed takeover only, and lets go on release so the next tab claims with no takeover', () => {
    const store = memoryStore();
    writeAttemptSlot(store, 'c7', { kind: 'write', attempt: ATTEMPT }, 'aaaa');
    expect(writeAttemptSlot(store, 'c7', { kind: 'claim', takeOver: false }, 'bbbb').ok).toBe(false);
    expect(writeAttemptSlot(store, 'c7', { kind: 'claim', takeOver: true }, 'bbbb').ok).toBe(true);
    expect(loadAttempts(store).get('c7')?.holder).toBe('bbbb');
    writeAttemptSlot(store, 'c7', { kind: 'release' }, 'bbbb');
    expect(loadAttempts(store).get('c7')?.holder).toBeNull();
    expect(writeAttemptSlot(store, 'c7', { kind: 'claim', takeOver: false }, 'cccc').ok).toBe(true);
  });
});
