/**
 * `poolWays.ts` — wave AP, lane DT-1, [§ D1463](../../../../DECISIONS.md): the brief's count names
 * no driver, the close's names every driver that cleared, past tense, and a crowd the census has not
 * finished gets neither line.
 */

import { describe, expect, it } from 'vitest';

import { poolCloseLineOf, poolWaysLineOf } from './poolWays.js';
import { WEEK_POOL, type PoolCrowd } from './weekPool.js';

const PROFILES = WEEK_POOL.protocol.profiles;
const NAMES: Readonly<Record<string, string>> = { 'fairness-first': 'Fairness first', collective: 'Collective', eta: 'ETA' };
const nameOf = (id: string): string | undefined => NAMES[id];

function crowd(cleared: readonly string[], extra: Partial<PoolCrowd> = {}): PoolCrowd {
  return {
    seed: '20260701100',
    tag: cleared.length > 0 ? 'live' : 'need',
    alone: PROFILES.map((id) => (cleared.includes(id) ? 'C' : 'm')).join(''),
    calls: [],
    ...extra,
  };
}

describe('the brief’s ways line', () => {
  it('counts the drivers that clear the crowd left alone and names none', () => {
    const line = poolWaysLineOf(crowd(['fairness-first', 'collective']));
    expect(line).toBe(`Ways through, measured on this crowd: left alone, 2 of the ${String(PROFILES.length)} drivers clear the day.`);
    for (const name of Object.values(NAMES)) expect(line).not.toContain(name);
  });

  it('says a call cleared it where no driver does, and is silent on a crowd nothing cleared', () => {
    const called = crowd([], { calls: [{ by: 'fairness-first', atS: 2648, question: 'driver', offered: ['eta', 'auction'], clears: ['eta'] }] });
    expect(poolWaysLineOf(called)).toMatch(/none of the 13 drivers clears the day left alone; answering a call cleared it\.$/u);
    expect(poolWaysLineOf(crowd([]))).toBeUndefined();
  });

  it('withholds the count on a crowd the census has not finished, and off the pool', () => {
    const unfinished = { ...crowd(['fairness-first']), alone: 'C' + '-'.repeat(PROFILES.length - 1) };
    expect(poolWaysLineOf(unfinished)).toBeUndefined();
    expect(poolWaysLineOf(undefined)).toBeUndefined();
  });
});

describe('the close’s names', () => {
  it('names every driver that cleared, in the past tense', () => {
    expect(poolCloseLineOf(crowd(['fairness-first', 'collective', 'eta']), nameOf)).toBe(
      'On this crowd, left alone, ETA, Collective and Fairness first cleared the day.',
    );
  });

  it('names the answer that would have, on a crowd no driver cleared', () => {
    const called = crowd([], { calls: [{ by: 'fairness-first', atS: 2648, question: 'driver', offered: ['eta', 'auction'], clears: ['eta'] }] });
    expect(poolCloseLineOf(called, nameOf)).toBe(
      'On this crowd, no driver left alone cleared the day; handing the day to ETA at the call raised under Fairness first would have.',
    );
  });
});
