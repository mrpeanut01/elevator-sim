/**
 * **Midtown's admitted order, on the screen as measured before § D1603** — [§ D1616](../../../../DECISIONS.md),
 * carrying `weekDominance.test.ts`'s shipped pin from wave AN, lane DQ-2 ([§ D1345](../../../../DECISIONS.md)).
 *
 * `data/week-way.json`, `week-dominance.json`, `week-pool.json` and `call-bands.json` are mocked here
 * with the files as they stood on `4ee9557`, the engine before the fix, where DC-10 admits every day of
 * `midtown-early-lift` and DC-11 admits the week: every profile measured, and Predictive balanced
 * holding it on exactly half the crowds, which DC-11 admits (refused only above half). On the fixed
 * engine the order is held, and `weekDominance.test.ts` pins that reading.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../data/week-way.json', () => vi.importActual('./preD1603/week-way.json'));
vi.mock('../../../../data/week-dominance.json', () => vi.importActual('./preD1603/week-dominance.json'));
vi.mock('../../../../data/week-pool.json', () => vi.importActual('./preD1603/week-pool.json'));
vi.mock('../../../../data/call-bands.json', () => vi.importActual('./preD1603/call-bands.json'));

import { CONTRACT_LADDER } from './ladder.js';
import { weekDominanceOf } from './weekDominance.js';

const ordersOf = (contractId: string) => CONTRACT_LADDER.rows.find((row) => row.contractId === contractId)?.weekOrders;

describe('Midtown’s admitted order, as the screen measured it before § D1603', () => {
  it('holds midtown-early-lift under the line for every shipped profile', () => {
    const order = ordersOf('c2')?.find((entry) => entry.id === 'midtown-early-lift');
    expect(order).toBeDefined();
    if (order === undefined) return;
    const reading = weekDominanceOf('c2', order);
    expect(reading.verdict).toBe('admitted');
    expect(reading.missing).toEqual([]);
    expect(Object.fromEntries(reading.holds.map((hold) => [hold.profileId, hold.held]))).toEqual({
      'nearest-car': 0,
      eta: 2,
      collective: 0,
      'collective-enroute': 0,
      'energy-aware': 3,
      'fairness-first': 9,
      'capacity-aware': 6,
      'predictive-balanced': 10,
      auction: 8,
      'auction-multi-round': 7,
      'zoned-uppeak': 1,
      'destination-eta': 4,
      'destination-panel': 0,
    });
    expect(reading.strongest).toEqual({ profileId: 'predictive-balanced', held: 10, n: 20 });
  });
});
