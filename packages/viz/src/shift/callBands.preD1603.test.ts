/**
 * **The call bands' census on a real dealt order, as measured before § D1603** —
 * [§ D1616](../../../../DECISIONS.md), carrying `callBands.test.ts`'s shipped-census cases from wave AO,
 * lane DR-2 ([§ D1441](../../../../DECISIONS.md), [§ D1442](../../../../DECISIONS.md)).
 *
 * On the fixed engine no Midtown order is dealt from week 2, so the shipped file has no row and these
 * checks would read nothing. Here `data/week-way.json`, `week-dominance.json`, `week-pool.json` and
 * `call-bands.json` are mocked with the files as they stood on `4ee9557`, the engine before the fix,
 * where `midtown-early-lift` is dealt as week 2 and measured under its two strongest profiles.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../data/week-way.json', () => vi.importActual('./preD1603/week-way.json'));
vi.mock('../../../../data/week-dominance.json', () => vi.importActual('./preD1603/week-dominance.json'));
vi.mock('../../../../data/week-pool.json', () => vi.importActual('./preD1603/week-pool.json'));
vi.mock('../../../../data/call-bands.json', () => vi.importActual('./preD1603/call-bands.json'));

import dispatcherProfiles from '../../../../data/dispatcher-profiles.json' with { type: 'json' };

import { DAY_CALL_DRIVER_OFFER } from './dayCalls.js';
import {
  CALL_BANDS,
  callBandsIssues,
  callBandsReadingOf,
  callSplits,
  driverOfferOf,
  shareWordsOf,
  weekBandsLinesOf,
  type CallBands,
  type CallBandsCall,
  type CallBandsProtocol,
  type CallBandsRow,
} from './callBands.js';
import { houseStandingOrder } from './weekStake.js';
import { bandedProfilesOf } from './weekDominance.js';
import { dealtWeekOrdersOf } from './weekOrders.js';
import { WEEK_WAY } from './weekWay.js';

type Mark = 'C' | 'm';

const SHIPPED_PROFILES: readonly string[] = (dispatcherProfiles as { profiles: { id: string }[] }).profiles.map(
  (profile) => profile.id,
);

const PROTOCOL: CallBandsProtocol = {
  contractId: 'c2',
  crowds: [0, 5, 10, 15],
  placement: 'park-cars-lobby',
  candidates: ['fairness-first', 'predictive-balanced', 'capacity-aware', 'energy-aware', 'eta'],
  keepLosesAtLeast: [1, 5],
  keepLosesAtMost: [3, 5],
  switchClearsAtLeast: [1, 5],
  answerClearsAtMost: [2, 3],
};

/** One raised who-drives call offering `a` and `b`, with every verdict given. */
function call(offered: readonly [string, string], marks: Readonly<Record<string, Mark>>): CallBandsCall {
  return { crowd: 0, day: 1, atS: 0, offered, marks };
}

/**
 * A row of `split` calls on which *keep* misses the first `keepLoses`, the first target clears the
 * first `aClears` and the second target the last `bClears` (shadow marks laid over them), plus
 * `quiet` calls where every answer clears. Which of them split is the reading's to say.
 */
function rowOf(input: {
  readonly briefDriver: string;
  readonly offered: readonly [string, string];
  readonly split: number;
  readonly keepLoses: number;
  readonly aClears: number;
  readonly bClears?: number;
  readonly quiet?: number;
  readonly shadow?: (index: number) => Readonly<Record<string, Mark>>;
}): CallBandsRow {
  const [a, b] = input.offered;
  const calls: CallBandsCall[] = [];
  for (let k = 0; k < input.split; k += 1) {
    const keep: Mark = k < input.keepLoses ? 'm' : 'C';
    const aMark: Mark = k < input.aClears ? 'C' : 'm';
    const bMark: Mark = k >= input.split - (input.bClears ?? 0) ? 'C' : 'm';
    calls.push(call(input.offered, { keep, [a]: aMark, [b]: bMark, ...(input.shadow?.(k) ?? {}) }));
  }
  for (let k = 0; k < (input.quiet ?? 0); k += 1) calls.push(call(input.offered, { keep: 'C', [a]: 'C', [b]: 'C' }));
  return {
    orderId: 'fixture',
    week: 2,
    briefDriver: input.briefDriver,
    days: ['a', 'b', 'c', 'd', 'e'],
    dayMarks: ['CCCCC', 'CCCCC', 'CCCCC', 'CCCCC'],
    calls,
  };
}

/** S1's Fairness first row: keep lost 13 of 25, Predictive balanced cleared 20, Energy aware 5. */
const FAIRNESS = rowOf({
  briefDriver: 'fairness-first',
  offered: ['predictive-balanced', 'energy-aware'],
  split: 25,
  keepLoses: 13,
  aClears: 20,
  bClears: 5,
  quiet: 34,
});

describe('the census before § D1603 — § D1441', () => {
  it('measures every order dealt from week 2 under its two strongest profiles, over well-formed rows', () => {
    /* The fixture is the one read: a dealt order and its rows, which the shipped files no longer carry. */
    expect(dealtWeekOrdersOf(CALL_BANDS.protocol.contractId).length).toBeGreaterThan(1);
    expect(CALL_BANDS.rows.length).toBeGreaterThan(0);
    expect(
      callBandsIssues(
        CALL_BANDS,
        dealtWeekOrdersOf(CALL_BANDS.protocol.contractId),
        SHIPPED_PROFILES,
        (order) => bandedProfilesOf(CALL_BANDS.protocol.contractId, order),
        WEEK_WAY.protocol.heldOutCount,
      ),
    ).toEqual([]);
  });

  it('names a stale or missing row', () => {
    const dealt = dealtWeekOrdersOf(CALL_BANDS.protocol.contractId);
    const issues = callBandsIssues(
      { ...CALL_BANDS, rows: [] },
      dealt,
      SHIPPED_PROFILES,
      (order) => bandedProfilesOf(CALL_BANDS.protocol.contractId, order),
      WEEK_WAY.protocol.heldOutCount,
    );
    expect(dealt.length).toBeGreaterThan(1);
    expect(issues.some((issue) => issue.includes('has no row under'))).toBe(true);
  });

  it('derives the offer it then shipped: the census’s list, never the house, and no name written in code', () => {
    expect(DAY_CALL_DRIVER_OFFER).toEqual(driverOfferOf(CALL_BANDS));
    expect(DAY_CALL_DRIVER_OFFER).not.toContain(houseStandingOrder());
    expect(DAY_CALL_DRIVER_OFFER.length).toBeGreaterThanOrEqual(3);
    for (const id of DAY_CALL_DRIVER_OFFER) expect(CALL_BANDS.protocol.candidates).toContain(id);
  });
});
